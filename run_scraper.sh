#!/usr/bin/env bash
# =============================================================================
# Script de Inicialização Automatizada - Minerador AliExpress
# =============================================================================

set -e

echo "=========================================="
echo " ⛏️ Inicializando Minerador AliExpress "
echo "=========================================="

# 1. Verifica Python 3.11+
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 não encontrado no sistema. Por favor instale Python 3.11+"
    exit 1
fi

echo "✅ Python detectado: $(python3 --version)"

# 2. Cria ambiente virtual se não existir
if [ ! -d "venv" ]; then
    echo "📦 Criando ambiente virtual venv..."
    python3 -m venv venv
fi

# 3. Ativa o ambiente virtual
source venv/bin/activate

# 4. Atualiza pip e instala dependências
echo "📦 Instalando dependências do requirements.txt..."
pip install --upgrade pip
pip install -r requirements.txt

# 5. Instala os binários do Chromium necessários para o Playwright
echo "🌐 Instalando binários do Playwright Chromium..."
playwright install chromium

# 6. Executa a aplicação Streamlit
echo "🚀 Iniciando Streamlit na porta 8501..."
export HEADLESS=true
streamlit run app.py --server.port=8501 --server.address=0.0.0.0
