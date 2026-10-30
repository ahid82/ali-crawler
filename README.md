# ⛏️ Minerador AliExpress

Aplicação Web em Python com **Streamlit**, **Playwright** (com injeção anti-bot **Playwright-Stealth**) e **Pandas** para raspagem de dados no AliExpress Brasil e ordenação estrita do menor para o maior preço.

---

## 🚀 Como Executar

### 1. Pré-requisitos
- Python 3.11 ou superior
- Pip e venv

### 2. Instalação rápida via Bash
```bash
chmod +x run_scraper.sh
./run_scraper.sh
```

### 3. Instalação manual passo a passo
```bash
# 1. Crie e ative o ambiente virtual
python3 -m venv venv
source venv/bin/activate  # No Windows: venv\Scripts\activate

# 2. Instale as bibliotecas
pip install -r requirements.txt

# 3. Instale os navegadores do Playwright (Chromium)
playwright install chromium

# 4. Inicie o Streamlit
streamlit run app.py
```

Acesse no navegador: `http://localhost:8501`.

---

## ⚙️ Variáveis de Ambiente

| Variável | Valores | Padrão | Descrição |
| :--- | :--- | :--- | :--- |
| `HEADLESS` | `true` ou `false` | `true` | Quando `false`, abre a janela visual do Chromium (ideal para depuração). |

Exemplo para debugar visualmente a janela do navegador:
```bash
HEADLESS=false streamlit run app.py
```

---

## ⚠️ Monitoramento de Seletores CSS Dinâmicos

O AliExpress frequentemente recompila seus seletores de CSS com nomes aleatórios (ex: `multi--content--...`, `multi--price-sale--...`).

No arquivo `app.py`, as seguintes constantes mapeiam os seletores em ordem de prioridade:
- `SELETORES_CARD`: Containers de cada produto no grid.
- `SELETORES_TITULO`: Cabeçalhos `<h3>` e tags de texto do título.
- `SELETORES_PRECO`: Elementos que contêm o valor monetário.
- `SELETORES_LINK`: Tags de âncora `<a>` com `/item/`.
- `SELETORES_IMAGEM`: Tags `<img>` com miniaturas CDN.

Se o AliExpress mudar o layout, inspecione a página com F12 no Chrome e atualize a lista correspondente em `app.py`.

---

## ☁️ Integração com Google Drive

A aplicação conta com suporte à integração com o **Google Drive (Google Workspace API v3)**:
- Autenticação cliente via Firebase Auth e popup Google.
- Criação e detecção automática da pasta `Minerador AliExpress` no Drive.
- Exportação direta de planilhas CSV com os resultados minerados e filtrados.
- Backup e sincronização do arquivo `historico_buscas.json`.
- Diálogo de confirmação obrigatório para ações destrutivas (exclusão de relatórios no Drive).

