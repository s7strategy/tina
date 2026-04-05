# Deploy na VPS (senha)

## 1. Instalar `sshpass` (uma vez por máquina)

- **macOS:** `brew install sshpass`
- **Ubuntu/Debian:** `sudo apt install sshpass`

## 2. Senha no arquivo (não vai pro Git)

```bash
cp deploy.credentials.example.env deploy.credentials.env
```

Abra `deploy.credentials.env` e coloque a senha do **root** do VPS na linha:

```bash
SSHPASS='sua_senha_aqui'
```

Use aspas simples se a senha tiver caracteres especiais.

## 3. Subir

```bash
bash deploy.sh
```

O script lê `deploy.credentials.env` automaticamente.

## O que o deploy faz

Build do frontend → rsync para o VPS → `npm install` no backend → PM2 reload.

O `.env` **no servidor** não é sobrescrito pelo rsync.

## Depois (quando você quiser)

Trocar para chave SSH, tirar senha do arquivo, endurecer o servidor — à sua escolha.
