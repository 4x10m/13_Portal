# 13_Portal — Portail des services AxiiomLab

## Structure

```
13_Portal/
├── services.yml          # Source de vérité (tous les services)
├── generate_portal.py    # Générateur HTML statique
├── index.html            # Rendu courant (copie du déploiement)
└── README.md
```

## Déploiement

Le portail est du **HTML statique** servi par deux routes :

| Route | Mécanisme |
|-------|-----------|
| `https://portal.axiiomlab.ovh` | Caddy vhost → `/var/www/portal/` |
| `https://portal.dolly-tilapia.ts.net` | Tailscale Serve `svc:portal` → `/var/www/portal` |

### Workflow

```bash
# 1. Modifier services.yml
vim services.yml

# 2. Générer le HTML
python3 generate_portal.py --output /var/www/portal/

# 3. Caddy sert automatiquement le nouveau fichier
```

### Vérification

```bash
# Public
curl -s https://portal.axiiomlab.ovh | head -5

# Tailscale (depuis une autre machine du tailnet)
curl -s https://portal.dolly-tilapia.ts.net | head -5
```

## Source de vérité

`services.yml` est le fichier de référence. Il contient :
- Les **catégories** de services (AI, Infra, Apps, Public)
- Les **URLs** Tailscale (et aliases)
- Les **ports** et **health endpoints**
- La **config Tailscale** (tailnet, domaine)

La config Tailscale Serve est backupée dans :
`../25_Tailscale-Services/tailscale-serve-restore/serve-config-backup.json`

## Dépendances

- Python 3 + PyYAML (`pip install pyyaml`)
