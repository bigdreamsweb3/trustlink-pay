# Hosting the TSN Node on AWS

The TSN Node runs as a persistent Docker service on an Ubuntu EC2 instance. The
Node listens only on `127.0.0.1:8000`; expose it publicly only through an HTTPS
reverse proxy. Keep the AWS security group limited to SSH (22) and HTTPS (443)
(HTTP 80 only when obtaining certificates).

## First-time server setup

```bash
sudo apt update
sudo apt install -y git docker.io
sudo systemctl enable --now docker
sudo usermod -aG docker ubuntu
newgrp docker
cd ~
git clone https://github.com/bigdreamsweb3/trustlink-pay.git
```

The checkout must contain `~/trustlink-pay/tsn-protocol/tsn-node`.

## Configure secrets locally

Edit `tsn-protocol/tsn-node/.env` locally, never in Git. It must contain the
same keys as `.env.example`. Required production values include the Receiver
credential, RPC gateway, program ID, Receiver URL, claim-slot HMAC secret, and
the configured Node/Mother signing and decryption keys. Do not replace keys
already registered with the deployed protocol using newly generated values.

## Deploy from WSL

```bash
export TSN_AWS_HOST=ubuntu@51.21.218.67
export TSN_AWS_KEY="$HOME/.ssh/tsn-node-key.pem"
bash tsn-protocol/tsn-node/deploy-aws.sh
```

The script validates required variables without printing their values, uploads
`.env` with mode `0600`, fast-forwards the server checkout, rebuilds the image,
replaces the container, and prints the last container log lines.

## Check and update

```bash
ssh -i "$TSN_AWS_KEY" "$TSN_AWS_HOST" 'docker ps; docker logs --tail 100 tsn-node'
```

Never commit `.env`, Firebase service-account files, wallet keys, or Node
signing keys. Rotate the Receiver/API credentials and signing keys through the
normal authority-rotation process before replacing them on the host.
