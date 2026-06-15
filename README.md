# Personal Academia Smart V14.6

PWA leve para GitHub Pages com treino sequencial, medidas/evolução e GIFs carregados pelo Google Drive com cache no app.

## O que mudou na V14.6

- Remove os GIFs físicos do repositório para evitar limite de upload do GitHub.
- Usa `gifDriveId` em `data/workouts.json` para carregar o GIF direto do Google Drive.
- Botão **Guardar GIF no app** no exercício atual.
- Botão **Guardar GIFs do próximo treino** na tela inicial.
- Botão **Guardar todos os GIFs mapeados** para pré-carregar tudo gradualmente.
- Botão **Baixar .gif no celular** como plano B, abrindo o download do Drive.
- Ícone do app redesenhado em `assets/icons/`.
- Botão **Spotify** direto no cabeçalho.
- Tela do exercício mais compacta: pontos de atenção, carga/notas e GIF/cache fechados por padrão.

## Observação sobre cache e celular

O navegador não pode salvar arquivos sozinho em uma pasta do celular sem permissão. A V14.6 faz o caminho mais prático para PWA:

1. Carrega o GIF pelo Drive.
2. Guarda no cache interno do app quando você toca em **Guardar GIF no app** ou **Guardar GIFs do próximo treino**.
3. Tenta exibir pelo cache nas próximas aberturas.

O botão **Baixar .gif no celular** abre o download do arquivo para a pasta padrão de downloads do Android, mas esse arquivo baixado não é lido automaticamente pelo app. Para o app, o que importa é o cache PWA.

## Arquivos para subir no GitHub

Suba a pasta inteira, sem `assets/gifs/`:

```text
index.html
styles.css
app.js
manifest.json
service-worker.js
README.md
data/workouts.json
assets/icons/
```

## Depois de publicar

Abra:

```text
https://etartaggia67-ui.github.io/personal-academia-smart/
```

Se aparecer versão antiga, limpe o cache/service worker ou aguarde o GitHub Pages atualizar.
