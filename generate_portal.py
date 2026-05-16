#!/usr/bin/env python3
"""Generate the AxiiomLab portal HTML from services.yml.

Usage:
    python3 generate_portal.py [--output /var/www/portal/]
"""

import argparse
import os
import yaml
from pathlib import Path
from datetime import datetime


TEMPLATE_HEAD = """<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AxiiomLab - Portail des services</title>
  <style>
    * {{ margin: 0; padding: 0; box-sizing: border-box; }}
    body {{
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: #e0e0e0;
      min-height: 100vh;
      padding: 2rem;
    }}
    .header {{
      text-align: center;
      margin-bottom: 3rem;
    }}
    .header h1 {{
      font-size: 2.5rem;
      margin-bottom: 0.5rem;
      background: linear-gradient(90deg, #00d9ff, #00ff88);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }}
    .header p {{ color: #888; font-size: 0.9rem; }}
    .category {{
      margin-bottom: 2.5rem;
    }}
    .category h2 {{
      font-size: 1.4rem;
      margin-bottom: 1rem;
      color: #00d9ff;
      border-bottom: 1px solid #2a2a4a;
      padding-bottom: 0.5rem;
    }}
    .grid {{
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      gap: 1rem;
    }}
    .card {{
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 12px;
      padding: 1.2rem;
      text-decoration: none;
      color: #e0e0e0;
      transition: all 0.2s ease;
    }}
    .card:hover {{
      background: rgba(255,255,255,0.1);
      border-color: #00d9ff;
      transform: translateY(-2px);
    }}
    .card .name {{
      font-size: 1.1rem;
      font-weight: 600;
      margin-bottom: 0.3rem;
    }}
    .card .desc {{
      font-size: 0.85rem;
      color: #aaa;
    }}
    .card .port {{
      font-size: 0.75rem;
      color: #555;
      margin-top: 0.5rem;
    }}
    .footer {{
      text-align: center;
      margin-top: 3rem;
      color: #555;
      font-size: 0.8rem;
    }}
  </style>
</head>
<body>
  <div class="header">
    <h1>AxiiomLab</h1>
    <p>Portail des services — généré le {date}</p>
  </div>
"""

TEMPLATE_CARD = """    <a class="card" href="{url}" target="_blank">
      <div class="name">{icon} {name}</div>
      <div class="desc">{desc}</div>
      {port_line}
    </a>
"""

TEMPLATE_FOOT = """  <div class="footer">
    <p>{count} services — AxiiomLab</p>
  </div>
</body>
</html>
"""


def load_services(path: str) -> dict:
    with open(path, "r") as f:
        return yaml.safe_load(f)


def generate_html(data: dict) -> str:
    date = datetime.now().strftime("%Y-%m-%d %H:%M")
    parts = [TEMPLATE_HEAD.format(date=date)]

    total = 0
    for cat in data.get("categories", []):
        icon = cat.get("icon", "📁")
        name = cat.get("name", "Uncategorized")
        parts.append(f'  <div class="category">')
        parts.append(f'    <h2>{icon} {name}</h2>')
        parts.append(f'    <div class="grid">')

        for svc in cat.get("services", []):
            total += 1
            port_line = ""
            if svc.get("port"):
                port_line = f'<div class="port">:{svc["port"]}</div>'
            parts.append(TEMPLATE_CARD.format(
                url=svc.get("url", "#"),
                icon=icon,
                name=svc.get("name", "?"),
                desc=svc.get("desc", ""),
                port_line=port_line,
            ))

        parts.append("    </div>")
        parts.append("  </div>")

    parts.append(TEMPLATE_FOOT.format(count=total))
    return "\n".join(parts)


def main():
    parser = argparse.ArgumentParser(description="Generate AxiiomLab portal")
    parser.add_argument("--output", default="/var/www/portal/", help="Output directory")
    parser.add_argument("--services", default=None, help="Path to services.yml (default: same dir as script)")
    args = parser.parse_args()

    script_dir = Path(__file__).parent
    services_path = args.services or str(script_dir / "services.yml")
    data = load_services(services_path)
    html = generate_html(data)

    out_dir = Path(args.output)
    out_dir.mkdir(parents=True, exist_ok=True)
    out_file = out_dir / "index.html"
    out_file.write_text(html, encoding="utf-8")
    print(f"Portal generated: {out_file} ({len(html)} bytes)")


if __name__ == "__main__":
    main()
