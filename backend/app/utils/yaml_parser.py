import re
from typing import cast

import yaml

from app.models.types import YamlFrontmatterResult, YamlMetadata

YAML_FIELD_PATTERN = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*:\s*")
KNOWN_YAML_FIELDS = {
    "name",
    "description",
    "model",
    "allowed_tools",
    "argument_hint",
    "color",
}


def _is_already_quoted(value: str) -> bool:
    return (
        value.startswith('"')
        or value.startswith("'")
        or value.startswith("|")
        or value.startswith(">")
    )


KNOWN_MODEL_VALUES = {
    "opus",
    "sonnet",
    "haiku",
    "claude-sonnet-4-5-20250929",
    "claude-opus-4-5-20251101",
    "claude-haiku-4-5-20251001",
}


def _is_real_yaml_field(line: str) -> bool:
    # Heuristics to distinguish real YAML fields from field-like text in description content:
    # - description/name: always real (primary fields that break continuation)
    # - model: only real if value is a known model name (opus, sonnet, haiku, etc.)
    # - other fields: real if value is empty, an array/object, or short (<20 chars without spaces)
    # This prevents "model: I will analyze..." inside examples from breaking the parser.
    if not line or line[0].isspace():
        return False
    if not YAML_FIELD_PATTERN.match(line):
        return False

    field_name, _, value = line.partition(":")
    field_name = field_name.strip()
    value = value.strip()

    if field_name not in KNOWN_YAML_FIELDS:
        return False

    if field_name in ("description", "name"):
        return True

    if not value:
        return True

    if field_name == "model":
        return value in KNOWN_MODEL_VALUES

    if value.startswith("[") or value.startswith("{"):
        return True

    if " " not in value or len(value) < 20:
        return True

    return False


def normalize_yaml_frontmatter(content: str) -> str:
    lines = content.split("\n")

    if not lines or lines[0].strip() != "---":
        return content

    yaml_end = None
    for i, line in enumerate(lines[1:], start=1):
        if line.strip() == "---":
            yaml_end = i
            break

    if yaml_end is None:
        return content

    yaml_lines = lines[1:yaml_end]
    normalized_lines = [lines[0]]

    i = 0
    while i < len(yaml_lines):
        line = yaml_lines[i]

        if re.match(r"^(description|name):\s*", line):
            field_name = line.split(":", 1)[0]
            value_part = line.split(":", 1)[1].strip() if ":" in line else ""

            if _is_already_quoted(value_part):
                normalized_lines.append(line)
                i += 1
                continue

            continuation_lines: list[str] = []
            j = i + 1
            while j < len(yaml_lines):
                next_line = yaml_lines[j]
                if _is_real_yaml_field(next_line):
                    break
                continuation_lines.append(next_line)
                j += 1

            if continuation_lines:
                normalized_lines.append(f"{field_name}: |-")
                if value_part:
                    normalized_lines.append(f"  {value_part}")
                for cont_line in continuation_lines:
                    normalized_lines.append(f"  {cont_line.rstrip()}")
                i = j
            else:
                if value_part and (":" in value_part or "<" in value_part):
                    value_part = value_part.replace('"', '\\"')
                    line = f'{field_name}: "{value_part}"'
                normalized_lines.append(line)
                i += 1
        else:
            normalized_lines.append(line)
            i += 1

    normalized_lines.extend(lines[yaml_end:])
    return "\n".join(normalized_lines)


def parse_yaml_frontmatter(content: str) -> YamlFrontmatterResult:
    lines = content.split("\n")

    if not lines or lines[0].strip() != "---":
        raise ValueError("Content must start with YAML frontmatter (---)")

    yaml_end = None
    for i, line in enumerate(lines[1:], start=1):
        if line.strip() == "---":
            yaml_end = i
            break

    if yaml_end is None:
        raise ValueError("YAML frontmatter must end with ---")

    normalized_content = normalize_yaml_frontmatter(content)
    normalized_lines = normalized_content.split("\n")

    normalized_yaml_end = None
    for i, line in enumerate(normalized_lines[1:], start=1):
        if line.strip() == "---":
            normalized_yaml_end = i
            break

    if normalized_yaml_end is None:
        raise ValueError("YAML frontmatter must end with ---")

    yaml_content = "\n".join(normalized_lines[1:normalized_yaml_end])
    markdown_content = "\n".join(normalized_lines[normalized_yaml_end + 1 :]).strip()

    try:
        metadata = yaml.safe_load(yaml_content)
    except yaml.YAMLError as e:
        raise ValueError(f"Invalid YAML frontmatter: {e}")

    if not isinstance(metadata, dict):
        raise ValueError("YAML frontmatter must be a dictionary")

    return {
        "metadata": cast(YamlMetadata, metadata),
        "markdown_content": markdown_content,
    }
