# Personal Academia Smart V14.4 PWA

Versão V14.4 para GitHub Pages.

## Mudanças principais

- Layout compacto para reduzir rolagem durante o treino.
- Pontos de atenção, carga/observações e ferramentas de GIF agora ficam recolhidos por padrão.
- GIFs automáticos via Google Drive para os exercícios mapeados na planilha de GIFs selecionados.
- Pré-cache inteligente: ao abrir o app, ele tenta guardar em cache os GIFs do próximo treino quando houver conexão.
- Ao iniciar um treino, o app tenta pré-carregar os GIFs do treino atual e do próximo treino.
- Mantém importação manual de GIF como substituição local.
- Se houver GIF manual salvo, ele tem prioridade sobre o GIF automático.
- Divisão eficiente para hipertrofia natural: Upper / Lower / Push / Pull / Lower / Recuperação ativa.
- Treino continua por sequência, não por dia da semana.
- Domingo permanece como Treino F, mas sem obrigação de calendário.
- Aba Medidas com peso, IMC, evolução, meta ideal e meta perseguida real.
- Registro rápido de carga, repetições e observação por exercício.
- Exportação de dados em JSON.
- PWA com manifest e service worker.

## Sequência

A → B → C → D → E → F → A

## Observação sobre os GIFs automáticos

Os GIFs são carregados por links públicos do Google Drive e guardados em cache quando possível.
Isso reduz a necessidade de importar manualmente, mas depende de conexão na primeira carga e da disponibilidade do Drive.

O botão de importação manual permanece como plano B para qualquer GIF que não carregue.

## Publicação no GitHub Pages

Substitua ou envie estes arquivos na raiz do repositório:

- index.html
- styles.css
- app.js
- manifest.json
- service-worker.js
- README.md
- data/workouts.json
- assets/icons/icon-192.png
- assets/icons/icon-512.png

Depois acesse:

https://etartaggia67-ui.github.io/personal-academia-smart/

Se abrir versão antiga, limpe cache do navegador ou aguarde o service worker atualizar.
