Pasta de backup do projeto Tina1
================================

O que tem aqui
--------------
- tina1-backup-2026-04-05.bundle : copia portatil do historico Git (pode restaurar o repo sem GitHub).
- BACKUP-RECORD.txt             : hash do commit, nome da tag e comandos uteis.

Enviar a pasta tina1 inteira por Drive (zip)
---------------------------------------------
Sim: em outro computador costuma funcionar normalmente SE voce:

1) Incluir no zip a pasta inteira do projeto, em especial:
   - a pasta .git (sem ela, voce perde historico/branches locais)
   - o codigo-fonte (frontend/, backend/, etc.)
   - esta pasta backups/ (com o .bundle)

2) node_modules normalmente NAO entra no zip (e pesado). No outro PC:
   - cd backend && npm install
   - cd frontend && npm install

3) NUNCA coloque no zip publico arquivos de senha (ex.: deploy.credentials.env).
   Se precisar do deploy, guarde credenciais separado e seguro.

Restaurar so a partir do .bundle (sem copiar .git)
---------------------------------------------------
  git clone caminho/para/tina1-backup-2026-04-05.bundle nome-da-pasta
