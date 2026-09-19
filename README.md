# 💬 Firefly III Natural Language Chat App (PWA)

Una aplicación web progresiva (PWA) minimalista que permite registrar rápidamente ingresos, gastos, transferencias y compras en cuotas en **Firefly III**, además de realizar consultas de saldos, presupuestos y movimientos recientes utilizando lenguaje natural impulsado por la API de **Groq** (`openai/gpt-oss-120b`).

Diseñada para desplegarse mediante **Docker** y servida de forma segura dentro de tu red privada con **Tailscale**.

---

## 🚀 Características

- **Registro Inteligente con IA:** Interpreta frases cotidianas en español (*"Gasté 5000 en el súper con Visa"*, *"Compré un lavarropas en 6 cuotas de 25000"*) y genera los payloads adecuados en formato JSON estricto.
- **Sincronización Dinámica:** Carga en tiempo real las cuentas de activo/ingreso, categorías y etiquetas (*tags*) existentes desde tu instancia de Firefly III.
- **Soporte para Compras en Cuotas:** Permite registrar transacciones recurrentes/futuras en cuotas mensuales calculadas automáticamente.
- **Consultas en Tiempo Real:** 
  - Saldos de cuentas de activo.
  - Estado de ejecución de presupuestos.
  - Historial de los últimos movimientos reales (descartando transacciones futuras).
- **Manejo de Fechas Relativas:** Calculadas dinámicamente según la zona horaria del usuario (`UTC-3`).
- **Seguridad Garantizada:** Servidor proxy intermedio en Node.js para evitar la exposición de tokens personales de Firefly III o API Keys de Groq en el cliente web.

---

## 🛠️ Arquitectura y Tecnologías

```
[ Navegador / PWA ] 
        │
        │ (HTTPS / SSL vía Tailscale Serve)
        ▼
[ Contenedor Docker: Node.js Proxy ] ─── (Servidor estático + API Proxy)
        │
        ├──> [ API de Groq ] (Modelo gpt-oss-120b)
        └──> [ Contenedor Firefly III ] (Red interna Docker / http://app:8080)
```

- **Frontend:** HTML5, CSS3 (Tailwind CSS) y JS Vanilla en un único archivo PWA (`public/index.html`).
- **Backend Proxy:** Node.js con Express.
- **Despliegue:** Docker, Docker Compose y Tailscale.

---

## 📁 Estructura del Proyecto

```text
.
├── .env.example         # Plantilla de variables de entorno
├── .gitignore            # Exclusión de credenciales y dependencias
├── Dockerfile           # Configuración de la imagen Docker (Node 20 Alpine)
├── docker-compose.yml   # Orquestación del contenedor y red de Firefly
├── package.json         # Dependencias del servidor Node.js
├── server.js            # Servidor proxy para Express
├── README.md            # Documentación del proyecto
└── public/
    └── index.html       # Interfaz de usuario (PWA Chat)
```

---

## ⚙️ Requisitos Previos

1. Instancia funcional de **Firefly III** corriendo en Docker.
2. Servidor VPS con **Docker**, **Docker Compose** y **Tailscale** instalado.
3. Una **API Key de Groq**.
4. Un **Personal Access Token** generado en Firefly III (*Opciones > Configuración de la cuenta > OAuth > Personal Access Tokens*).

---

## 📦 Instalación y Despliegue

### 1. Clonar el repositorio

```bash
git clone https://github.com/tu-usuario/firefly-chat-pwa.git
cd firefly-chat-pwa
```

### 2. Configurar las variables de entorno

Copiá el archivo de ejemplo y completá tus credenciales:

```bash
cp .env.example .env
nano .env
```

Configuración del archivo `.env`:

```env
# URL interna de Firefly III dentro de la red Docker
FIREFLY_URL=http://app:8080

# Personal Access Token de Firefly III
FIREFLY_TOKEN=tu_personal_access_token_de_firefly

# API Key de Groq
GROQ_API_KEY=gsk_tu_groq_api_key

# Puerto del servidor Proxy
PORT=3000
```

### 3. Configurar la red de Docker

Asegúrate de que la red externa especificada en `docker-compose.yml` coincida con la red de tu contenedor de Firefly III:

```bash
docker network ls
```

Si el nombre de la red de tu Firefly III difiere de `firefly_default`, ajustalo al final de `docker-compose.yml`:

```yaml
networks:
  firefly_network:
    external: true
    name: nombre_de_tu_red_docker
```

### 4. Iniciar la aplicación con Docker Compose

```bash
docker compose up -d --build
```

---

## 🔐 Exposición Segura con Tailscale Serve

Para acceder a la aplicación desde cualquier dispositivo conectado a tu Tailnet mediante HTTPS y con certificado SSL gestionado automáticamente:

```bash
sudo tailscale serve --https=8444 --bg http://localhost:3000
```

Accedé desde tu navegador o celular en:
`https://tu-dominio.tailscale.ts.net:8444`

---

## 🧪 Comandos Útiles

- **Ver logs de la aplicación en tiempo real:**
  ```bash
  docker logs -f firefly-chat
  ```
- **Reiniciar el contenedor:**
  ```bash
  docker compose restart
  ```
- **Ver el estado del proxy Tailscale:**
  ```bash
  sudo tailscale serve status
  ```

---

## 📄 Licencia

Este proyecto es de código abierto y está disponible bajo la licencia [MIT](LICENSE).