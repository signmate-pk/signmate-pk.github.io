"""Licence ledger (CLAUDE.md section 4): load data/LICENSES.yaml, validate it, check repository files,
and refuse uses an asset's licence does not allow.

    from data_engine.ledger import assert_allowed
    assert_allowed("asl-popsign-v1", "train_labels")                     # returns the entry (ASL is the default)
    assert_allowed("psl-signspeak-words", "train_labels")                # raises LicenceError: retired (master v4)
    assert_allowed("asl-gislr-competition-data", "redistribute_data")    # raises LicenceError: not allowed

Every training script, bundle builder and asset-copy step must call assert_allowed before it uses an
asset. tools/check_licenses.py runs check_repository() over the folders in SCAN_RULES.
"""

from __future__ import annotations

import datetime as _dt
import fnmatch
import hashlib
import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parents[1]
LEDGER_PATH = ROOT / "data" / "LICENSES.yaml"
SCHEMA_PATH = ROOT / "data" / "licenses.schema.json"

USES = ("pretrain_encoder", "train_labels", "evaluate", "reference_clip", "redistribute_weights", "redistribute_data")
CLEARED = ("cleared", "cleared_with_conditions")
LANGUAGES = ("PSL", "ASL")

# Folders whose files must each be covered by a ledger entry, with the uses that entry must allow.
# The most specific (longest) root wins. "shipped" roots end up inside the website build.
SCAN_RULES: tuple[dict[str, Any], ...] = (
    {"root": "web/public/clips", "all_of": ("reference_clip", "redistribute_data"), "any_of": (), "shipped": True},
    {"root": "web/public/models", "all_of": ("redistribute_weights",), "any_of": (), "shipped": True},
    {"root": "models", "all_of": ("redistribute_weights",), "any_of": (), "shipped": True},
    {"root": "data", "all_of": (), "any_of": ("train_labels", "pretrain_encoder", "evaluate", "reference_clip"), "shipped": False},
)
IGNORED_NAMES = {".gitkeep", "README.md", ".DS_Store", "Thumbs.db", "desktop.ini"}
IGNORED_PATTERNS = ("data/LICENSES.yaml", "data/licenses.schema.json", "data/cards/*", "data/mappings/*", "models/*.download",
                    "data/web_learn/*")  # web_learn: search metadata (candidates, drafted ledger entries), not data


class LedgerError(Exception):
    """The ledger file is missing, unreadable or invalid."""


class LicenceError(Exception):
    """An asset's ledger entry does not allow the requested use."""


@dataclass
class CheckReport:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    covered: dict[str, str] = field(default_factory=dict)  # repository path -> asset id

    @property
    def ok(self) -> bool:
        return not self.errors


# --------------------------------------------------------------------------- loading

def load_ledger(path: Path | str = LEDGER_PATH) -> dict:
    try:
        import yaml  # PyYAML
    except ImportError as error:  # pragma: no cover - depends on the environment
        raise LedgerError("PyYAML is needed to read data/LICENSES.yaml: run  pip install -r requirements.txt") from error
    path = Path(path)
    if not path.exists():
        raise LedgerError(f"{path} does not exist")
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as error:
        raise LedgerError(f"{path} is not valid YAML: {error}") from error
    if not isinstance(data, dict):
        raise LedgerError(f"{path} must contain a mapping with schema_version and assets")
    return data


def load_schema(path: Path | str = SCHEMA_PATH) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


# --------------------------------------------------------------------------- schema validation

def _type_ok(value: Any, expected: str) -> bool:
    if expected == "object":
        return isinstance(value, dict)
    if expected == "array":
        return isinstance(value, list)
    if expected == "string":
        return isinstance(value, str)
    if expected == "boolean":
        return isinstance(value, bool)
    if expected == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if expected == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if expected == "null":
        return value is None
    raise ValueError(f"schema type {expected!r} is not supported by the built-in validator")


def _mini_validate(value: Any, schema: dict, where: str, errors: list[str]) -> None:
    """The subset of JSON Schema that data/licenses.schema.json uses. Used when jsonschema is absent."""
    supported = {"$schema", "$id", "title", "description", "type", "required", "properties", "additionalProperties",
                 "enum", "const", "pattern", "items", "minItems", "minLength"}
    unknown = set(schema) - supported
    if unknown:
        raise ValueError(f"built-in validator does not support {sorted(unknown)} at {where}")
    if "const" in schema and value != schema["const"]:
        errors.append(f"{where}: must be {schema['const']!r}")
        return
    if "enum" in schema and value not in schema["enum"]:
        errors.append(f"{where}: {value!r} is not one of {schema['enum']}")
        return
    if "type" in schema:
        types = schema["type"] if isinstance(schema["type"], list) else [schema["type"]]
        if not any(_type_ok(value, t) for t in types):
            errors.append(f"{where}: expected {' or '.join(types)}, got {type(value).__name__}")
            return
    if isinstance(value, str):
        if "minLength" in schema and len(value) < schema["minLength"]:
            errors.append(f"{where}: shorter than {schema['minLength']} characters")
        if "pattern" in schema and not re.search(schema["pattern"], value):
            errors.append(f"{where}: {value!r} does not match {schema['pattern']}")
    if isinstance(value, list):
        if "minItems" in schema and len(value) < schema["minItems"]:
            errors.append(f"{where}: needs at least {schema['minItems']} items")
        if "items" in schema:
            for index, item in enumerate(value):
                _mini_validate(item, schema["items"], f"{where}[{index}]", errors)
    if isinstance(value, dict):
        for key in schema.get("required", []):
            if key not in value:
                errors.append(f"{where}: missing required field {key!r}")
        properties = schema.get("properties", {})
        extra = schema.get("additionalProperties", True)
        for key, item in value.items():
            if key in properties:
                _mini_validate(item, properties[key], f"{where}.{key}", errors)
            elif extra is False:
                errors.append(f"{where}: unknown field {key!r}")
            elif isinstance(extra, dict):
                _mini_validate(item, extra, f"{where}.{key}", errors)


def schema_errors(ledger: Any, schema: dict | None = None, prefer_jsonschema: bool = True) -> list[str]:
    schema = schema if schema is not None else load_schema()
    if prefer_jsonschema:
        try:
            import jsonschema
        except ImportError:
            jsonschema = None
        if jsonschema is not None:
            validator = jsonschema.Draft202012Validator(schema)
            found = []
            for error in sorted(validator.iter_errors(ledger), key=lambda e: list(e.absolute_path)):
                where = "ledger" + "".join(f"[{p}]" if isinstance(p, int) else f".{p}" for p in error.absolute_path)
                found.append(f"{where}: {error.message}")
            return found
    found: list[str] = []
    _mini_validate(ledger, schema, "ledger", found)
    return found


# --------------------------------------------------------------------------- semantic validation

def _rule_for(path: str) -> dict | None:
    best = None
    for rule in SCAN_RULES:
        root = rule["root"] + "/"
        if path.startswith(root) and (best is None or len(rule["root"]) > len(best["root"])):
            best = rule
    return best


def validate_ledger(ledger: Any, schema: dict | None = None, today: _dt.date | None = None) -> list[str]:
    """Schema errors first; if the shape is right, the rules the schema cannot express."""
    errors = schema_errors(ledger, schema)
    if errors:
        return errors
    today = today or _dt.date.today()
    seen: set[str] = set()
    for index, entry in enumerate(ledger["assets"]):
        name = f"assets[{index}] ({entry['id']})"
        if entry["id"] in seen:
            errors.append(f"{name}: duplicate id")
        seen.add(entry["id"])
        try:
            checked = _dt.date.fromisoformat(entry["checked_on"])
            if checked > today:
                errors.append(f"{name}: checked_on {entry['checked_on']} is in the future")
        except ValueError:
            errors.append(f"{name}: checked_on {entry['checked_on']!r} is not a real date")
        expected_scope = {"PSL": "psl", "ASL": "asl_mode_only", "none": "none"}[entry["sign_language"]]
        if entry["label_scope"] != expected_scope:
            errors.append(f"{name}: sign_language {entry['sign_language']} needs label_scope {expected_scope} (CLAUDE.md 8.2)")
        uses = entry["allowed_uses"]
        conditions = set(entry["conditions"])
        if (entry["status"] == "retired") != ("retired" in entry):
            errors.append(f"{name}: status retired and the 'retired' record go together")
        if entry["status"] not in CLEARED:
            if any(uses.values()):
                errors.append(f"{name}: status {entry['status']} cannot allow any use")
            if entry["files"]:
                errors.append(f"{name}: status {entry['status']} cannot cover files")
        if conditions & {"non_commercial", "research_only"} and (uses["redistribute_weights"] or uses["redistribute_data"]):
            errors.append(f"{name}: a non-commercial or research-only asset cannot be redistributed by a public app")
        if conditions & {"non_commercial", "research_only"} and uses["pretrain_encoder"] and not uses["redistribute_weights"]:
            errors.append(f"{name}: an encoder pretrained on it would ship its weights; pretrain_encoder must be false")
        if "attribution" in conditions and not entry["attribution"].strip():
            errors.append(f"{name}: condition 'attribution' needs attribution text")
        for item in entry["files"]:
            if _rule_for(item["path"]) is None:
                roots = ", ".join(rule["root"] + "/" for rule in SCAN_RULES)
                errors.append(f"{name}: file pattern {item['path']} is outside the checked folders ({roots})")
            if "sha256" in item and any(ch in item["path"] for ch in "*?["):
                errors.append(f"{name}: sha256 needs an exact path, not the pattern {item['path']}")
    return errors


# --------------------------------------------------------------------------- repository check

def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def scan_files(root: Path = ROOT) -> list[str]:
    """Repository-relative POSIX paths of every file under the checked folders, minus ignored ones."""
    found: set[str] = set()
    for rule in SCAN_RULES:
        base = Path(root) / rule["root"]
        if not base.is_dir():
            continue
        for path in base.rglob("*"):
            if not path.is_file() or path.name in IGNORED_NAMES:
                continue
            relative = path.relative_to(root).as_posix()
            if any(fnmatch.fnmatchcase(relative, pattern) for pattern in IGNORED_PATTERNS):
                continue
            found.add(relative)
    return sorted(found)


def _matching_entries(ledger: dict, path: str) -> list[tuple[dict, dict]]:
    matches = []
    for entry in ledger["assets"]:
        for item in entry["files"]:
            if fnmatch.fnmatchcase(path, item["path"]):
                matches.append((entry, item))
                break
    return matches


def check_repository(ledger: dict, root: Path = ROOT, release: bool = False, files: Iterable[str] | None = None) -> CheckReport:
    """Every file in the checked folders must be covered by exactly one entry that allows its use.

    release=True is for store releases: every shipped file needs a recorded SHA-256, and shipped files
    may not come from assets with unresolved provenance or non-commercial terms.
    """
    report = CheckReport()
    root = Path(root)
    for path in (sorted(files) if files is not None else scan_files(root)):
        rule = _rule_for(path)
        if rule is None:
            continue
        matches = _matching_entries(ledger, path)
        if not matches:
            report.errors.append(f"{path}: not in data/LICENSES.yaml. Add an entry (licence, allowed uses, source) or remove the file.")
            continue
        if len(matches) > 1:
            ids = ", ".join(entry["id"] for entry, _ in matches)
            report.errors.append(f"{path}: covered by more than one ledger entry ({ids})")
            continue
        entry, item = matches[0]
        report.covered[path] = entry["id"]
        if entry["status"] not in CLEARED:
            report.errors.append(f"{path}: ledger entry {entry['id']} has status {entry['status']}; it may not be in the repository")
            continue
        uses = entry["allowed_uses"]
        missing = [use for use in rule["all_of"] if not uses[use]]
        if missing:
            report.errors.append(f"{path}: files in {rule['root']}/ need {', '.join(missing)}, which {entry['id']} does not allow")
        if rule["any_of"] and not any(uses[use] for use in rule["any_of"]):
            report.errors.append(f"{path}: files in {rule['root']}/ need one of {', '.join(rule['any_of'])}; {entry['id']} allows none")
        if "sha256" in item:
            actual = sha256_file(root / path)
            if actual != item["sha256"]:
                report.errors.append(f"{path}: SHA-256 {actual} does not match the ledger ({item['sha256']}) for {entry['id']}")
        elif rule["shipped"] and entry["kind"] != "own_data":
            # Hash pinning guards against a swapped third-party file; project-authored files change by design.
            message = f"{path}: no SHA-256 recorded in the ledger ({entry['id']})"
            (report.errors if release else report.warnings).append(message + (" - required for a release build" if release else ""))
        if release and rule["shipped"]:
            blocking = set(entry["conditions"]) & {"provenance_unverified", "non_commercial", "research_only", "access_by_request"}
            if blocking:
                report.errors.append(f"{path}: {entry['id']} has unresolved conditions {sorted(blocking)}; resolve them before a store release")
    return report


# --------------------------------------------------------------------------- gate for code paths

def get_entry(asset_id: str, ledger: dict | None = None) -> dict:
    ledger = ledger if ledger is not None else load_ledger()
    for entry in ledger["assets"]:
        if entry["id"] == asset_id:
            return entry
    raise LicenceError(f"{asset_id!r} is not in data/LICENSES.yaml, so it may not be used for anything")


def assert_allowed(asset_id: str, use: str, purpose_language: str = "ASL", ledger: dict | None = None) -> dict:
    """Return the ledger entry if `use` is allowed for `asset_id`; raise LicenceError otherwise.

    purpose_language is the sign language of the model or feature being built. Since master v4 that is ASL
    (CLAUDE.md 10.1): every PSL entry is retired, and labels or clips of one sign language never serve another.
    """
    if use not in USES:
        raise ValueError(f"unknown use {use!r}; choose from {USES}")
    if purpose_language not in LANGUAGES:
        raise ValueError(f"purpose_language must be one of {LANGUAGES}")
    entry = get_entry(asset_id, ledger)
    if entry["status"] not in CLEARED:
        raise LicenceError(f"{asset_id}: status is {entry['status']}, so it may not be used ({entry.get('notes', '').strip()})")
    if not entry["allowed_uses"][use]:
        raise LicenceError(f"{asset_id}: its licence ({entry['licence']}) does not allow {use}")
    if use == "train_labels" and entry["sign_language"] in LANGUAGES and entry["sign_language"] != purpose_language:
        raise LicenceError(f"{asset_id}: {entry['sign_language']} labels may not train a {purpose_language} model (CLAUDE.md 8.2)")
    if use == "reference_clip" and entry["sign_language"] in LANGUAGES and entry["sign_language"] != purpose_language:
        raise LicenceError(f"{asset_id}: {entry['sign_language']} clips may not be shown as {purpose_language} (CLAUDE.md 8.2)")
    return entry


def uses_table(ledger: dict) -> list[str]:
    """Plain-text table of every asset: id, status, licence, and which uses are allowed."""
    short = {"pretrain_encoder": "pre", "train_labels": "train", "evaluate": "eval", "reference_clip": "clip",
             "redistribute_weights": "ship-w", "redistribute_data": "ship-d"}
    lines = [f"{'asset':<34} {'lang':<4} {'status':<24} " + " ".join(f"{v:<6}" for v in short.values()) + "  licence"]
    for entry in ledger["assets"]:
        marks = " ".join(f"{'yes' if entry['allowed_uses'][use] else '-':<6}" for use in short)
        lines.append(f"{entry['id']:<34} {entry['sign_language']:<4} {entry['status']:<24} {marks}  {entry['licence']}")
    return lines
