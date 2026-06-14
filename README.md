# Personal Academia Smart V14 — PWA Offline

App de treino visual ABC para uso no celular, sem Google Apps Script.

## Arquivos principais
- `index.html` — tela principal
- `styles.css` — visual
- `app.js` — lógica do app
- `manifest.json` — instalação como PWA
- `service-worker.js` — cache/offline
- `data/workouts.json` — treinos e máquinas
- `assets/gifs/` — pasta opcional para GIFs hospedados

## GIFs
Você pode usar os GIFs de duas formas:

1. Dentro do app: Config > Importar GIFs/imagens. Eles ficam salvos no celular.
2. No repositório: coloque em `assets/gifs/` e liste em `assets/manifest.json`.

Exemplo de `assets/manifest.json`:

```json
{
  "assets": [
    { "name": "supino-articulado.gif", "path": "assets/gifs/supino-articulado.gif" },
    { "name": "leg-press.gif", "path": "assets/gifs/leg-press.gif" }
  ]
}
```

## Backup
Use Config > Exportar JSON para guardar suas cargas e medidas.
