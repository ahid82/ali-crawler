export const APP_PY_CONTENT = `#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
===============================================================================
PROJETO: Minerador AliExpress (Web Scraping, Filtro de Preço & Histórico)
AUTOR: Engenheiro de Software Sênior especialista em Web Scraping e Python
STACK: Python 3.11+, Streamlit, Playwright, Playwright-Stealth, Pandas, Regex
DATA: 2026
===============================================================================
"""

import os
import sys
import re
import json
import time
import random
import urllib.parse
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple

import streamlit as st
import pandas as pd
from playwright.sync_api import sync_playwright, Browser, BrowserContext, Page
from playwright_stealth import stealth_sync

# =============================================================================
# 1. CONFIGURAÇÕES GERAIS, ARQUIVOS LOCAIS E CONSTANTES ANTI-BOT
# =============================================================================

# Modo headless configurável via variável de ambiente (Padrão: True para produção)
# Para inspecionar visualmente a janela do navegador em desenvolvimento local:
# export HEADLESS=false
HEADLESS_MODE = os.getenv("HEADLESS", "true").strip().lower() in ("true", "1", "yes")

# Arquivo local persistente para salvar o histórico de buscas em formato JSON
ARQUIVO_HISTORICO = os.getenv("HISTORICO_PATH", "historico_buscas.json")

# URL base do AliExpress Brasil
URL_BASE_ALIEXPRESS = "https://pt.aliexpress.com/wholesale?SearchText={termo}"

# User-Agent atualizado de alta reputação para diminuir score de detecção
USER_AGENT_PADRAO = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

# =============================================================================
# ⚠️ ATENÇÃO: MAPA DE SELETORES CSS DO ALIEXPRESS (CLASSES DINÂMICAS)
# -----------------------------------------------------------------------------
# O AliExpress utiliza sistemas de obfuscation e compilação de CSS Modules
# (ex: \`multi--content--...\`, \`search-card-item--...\`). Essas classes sofrem
# mutação periódica a cada deploy do frontend da Alibaba.
#
# Para garantir resiliência máxima, utilizamos tuplas de seletores CSS
# ordenados por prioridade (seletores por atributo parciais \`[class*="..."]\`
# combinados com seletores semânticos). Se a estrutura do site mudar:
# ATUALIZE ESTAS CONSTANTES ABAIXO!
# =============================================================================

# Seletores do Card/Container do Produto no Grid
SELETORES_CARD = [
    "div[class*='multi--content--']",
    "div[class*='search-item-card']",
    "div[class*='list--galleryWrap--'] > div",
    "div[class*='search-card-item']",
    "div.search-item-card-wrapper-gallery",
    "a[class*='multi--container--']",
    "div[data-spm-anchor-id*='wholesale']",
]

# Seletores do Título do Produto
SELETORES_TITULO = [
    "h3[class*='multi--titleText--']",
    "div[class*='multi--title--']",
    "h1[class*='multi--titleText--']",
    "div[class*='search-card-item'] h3",
    "span[class*='title--title--']",
    "a[class*='multi--title--']",
    "h3",
]

# Seletores de Preço (Valor bruto exibido na interface)
SELETORES_PRECO = [
    "div[class*='multi--price-sale--']",
    "div[class*='price--currentPrice--']",
    "div[class*='multi--price--']",
    "span[class*='price--salePrice--']",
    "span[class*='multi--price-sale--']",
    "div[class*='price--current--']",
    "div[class*='multi--main--'] span",
]

# Seletores de Link do Produto
SELETORES_LINK = [
    "a[href*='/item/']",
    "a[class*='multi--container--']",
    "a[class*='multi--title--']",
    "a",
]

# Seletores de Imagem / Thumbnail
SELETORES_IMAGEM = [
    "img[class*='multi--image--']",
    "img[class*='mainImage']",
    "div[class*='multi--image--'] img",
    "img[src*='aliexpress-media']",
    "img[src*='alicdn']",
    "img",
]


# =============================================================================
# 2. GERENCIAMENTO DO HISTÓRICO DE BUSCAS LOCAL (PERSISTÊNCIA JSON)
# =============================================================================

def carregar_historico() -> List[Dict[str, Any]]:
    """Carrega o histórico de buscas salvo localmente no arquivo JSON."""
    if not os.path.exists(ARQUIVO_HISTORICO):
        return []
    try:
        with open(ARQUIVO_HISTORICO, "r", encoding="utf-8") as f:
            dados = json.load(f)
            if isinstance(dados, list):
                return dados
    except Exception:
        pass
    return []


def salvar_busca_historico(termo: str, total_produtos: int = 0, menor_preco: Optional[float] = None) -> None:
    """Adiciona ou atualiza um termo no arquivo local de histórico (JSON)."""
    termo_limpo = termo.strip()
    if not termo_limpo:
        return

    historico = carregar_historico()
    historico = [h for h in historico if h.get("termo", "").lower() != termo_limpo.lower()]

    nova_entrada = {
        "termo": termo_limpo,
        "data_hora": datetime.now().strftime("%d/%m/%Y %H:%M"),
        "total_produtos": total_produtos,
        "menor_preco": menor_preco,
    }
    historico.insert(0, nova_entrada)
    historico = historico[:30]

    try:
        with open(ARQUIVO_HISTORICO, "w", encoding="utf-8") as f:
            json.dump(historico, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"Erro ao salvar histórico local: {e}", file=sys.stderr)


def limpar_historico_local() -> bool:
    """Limpa o arquivo local de histórico de buscas."""
    try:
        if os.path.exists(ARQUIVO_HISTORICO):
            os.remove(ARQUIVO_HISTORICO)
        return True
    except Exception:
        return False


# =============================================================================
# 3. INFRAESTRUTURA DE NAVEGAÇÃO E ANTI-BOT (PLAYWRIGHT + STEALTH)
# =============================================================================

def iniciar_browser(p, headless: bool = HEADLESS_MODE) -> Tuple[Browser, BrowserContext, Page]:
    argumentos_chromium = [
        "--disable-blink-features=AutomationControlled",
        "--disable-infobars",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--lang=pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    ]

    browser: Browser = p.chromium.launch(
        headless=headless,
        args=argumentos_chromium
    )

    context: BrowserContext = browser.new_context(
        user_agent=USER_AGENT_PADRAO,
        viewport={"width": 1440, "height": 900},
        locale="pt-BR",
        timezone_id="America/Sao_Paulo",
    )

    page: Page = context.new_page()
    stealth_sync(page)

    return browser, context, page


def rolar_pagina_suave(page: Page, scrolls: int = 5, callback_status=None) -> None:
    for i in range(1, scrolls + 1):
        pixels = 1000 * i
        if callback_status:
            callback_status(
                f"Rolando a página ({pixels}px) [Passo {i}/{scrolls}] com pausas aleatórias..."
            )

        page.evaluate(f"window.scrollTo(0, {pixels});")
        pausa = random.uniform(1.5, 3.5)
        time.sleep(pausa)


# =============================================================================
# 4. EXTRAÇÃO DE DADOS DO DOM (SCRAPING)
# =============================================================================

def extrair_dados(
    termo_busca: str,
    scrolls: int = 5,
    callback_status=None,
    headless: bool = HEADLESS_MODE
) -> List[Dict[str, Any]]:
    termo_codificado = urllib.parse.quote(termo_busca.strip())
    url_alvo = URL_BASE_ALIEXPRESS.format(termo=termo_codificado)
    produtos_brutos: List[Dict[str, Any]] = []

    if callback_status:
        callback_status("Iniciando navegador com Playwright & Stealth Shield...")

    with sync_playwright() as p:
        browser, context, page = iniciar_browser(p, headless=headless)

        try:
            if callback_status:
                callback_status(f"Navegando para AliExpress: '{termo_busca}'...")

            page.goto(url_alvo, wait_until="domcontentloaded", timeout=45000)

            try:
                page.wait_for_selector(
                    ", ".join(SELETORES_CARD),
                    timeout=10000,
                    state="attached"
                )
            except Exception:
                time.sleep(2.0)

            rolar_pagina_suave(page, scrolls=scrolls, callback_status=callback_status)

            if callback_status:
                callback_status("Extraindo cards de produtos do DOM...")

            cards = []
            for seletor in SELETORES_CARD:
                elementos = page.query_selector_all(seletor)
                if len(elementos) >= 3:
                    cards = elementos
                    break

            if not cards:
                cards = page.query_selector_all("a[href*='/item/']")

            for idx, card in enumerate(cards):
                try:
                    titulo = ""
                    for s_titulo in SELETORES_TITULO:
                        el_titulo = card.query_selector(s_titulo)
                        if el_titulo:
                            texto = el_titulo.inner_text().strip()
                            if texto:
                                titulo = texto
                                break
                    if not titulo:
                        titulo = card.get_attribute("title") or card.get_attribute("aria-label") or ""

                    preco_bruto = ""
                    for s_preco in SELETORES_PRECO:
                        el_preco = card.query_selector(s_preco)
                        if el_preco:
                            texto_preco = el_preco.inner_text().strip()
                            if texto_preco and any(char.isdigit() for char in texto_preco):
                                preco_bruto = texto_preco
                                break

                    link = ""
                    for s_link in SELETORES_LINK:
                        el_link = card.query_selector(s_link) if card.tag_name != "a" else card
                        if el_link:
                            href = el_link.get_attribute("href")
                            if href and "/item/" in href:
                                link = href
                                break
                    if link and not link.startswith("http"):
                        link = "https:" + link if link.startswith("//") else "https://pt.aliexpress.com" + link

                    imagem_url = ""
                    for s_img in SELETORES_IMAGEM:
                        el_img = card.query_selector(s_img)
                        if el_img:
                            src = (
                                el_img.get_attribute("src")
                                or el_img.get_attribute("data-src")
                                or el_img.get_attribute("srcset")
                            )
                            if src:
                                imagem_url = src.split()[0]
                                break
                    if imagem_url and not imagem_url.startswith("http"):
                        imagem_url = "https:" + imagem_url if imagem_url.startswith("//") else imagem_url

                    if titulo or preco_bruto:
                        produtos_brutos.append({
                            "titulo": titulo if titulo else f"Produto sem título #{idx+1}",
                            "preco_bruto": preco_bruto,
                            "link": link,
                            "imagem_url": imagem_url,
                        })

                except Exception:
                    continue

        finally:
            context.close()
            browser.close()

    return produtos_brutos


# =============================================================================
# 5. TRATAMENTO, LIMPEZA COM REGEX E PANDAS
# =============================================================================

def limpar_preco_string(preco_str: Any) -> Optional[float]:
    if not preco_str or not isinstance(preco_str, str):
        return None

    texto = preco_str.strip()
    padrao_preco = r"(\\d{1,3}(?:\\.\\d{3})*,\\d{2}|\\d+,\\d{2}|\\d+\\.\\d{2}|\\d+)"
    match = re.search(padrao_preco, texto)

    if not match:
        return None

    numero_capturado = match.group(1)

    try:
        if "," in numero_capturado:
            numero_limpo = numero_capturado.replace(".", "")
            numero_limpo = numero_limpo.replace(",", ".")
        else:
            numero_limpo = numero_capturado

        valor_float = float(numero_limpo)
        if valor_float <= 0:
            return None

        return round(valor_float, 2)
    except (ValueError, TypeError):
        return None


def limpar_dados(dados_brutos: List[Dict[str, Any]]) -> pd.DataFrame:
    if not dados_brutos:
        return pd.DataFrame(columns=["titulo", "preco_num", "preco_formatado", "preco_bruto", "link", "imagem_url"])

    df = pd.DataFrame(dados_brutos)
    df["preco_num"] = df["preco_bruto"].apply(limpar_preco_string)
    df = df.dropna(subset=["preco_num"])
    df = df[df["preco_num"] > 0]

    if df.empty:
        return pd.DataFrame(columns=["titulo", "preco_num", "preco_formatado", "preco_bruto", "link", "imagem_url"])

    df["preco_formatado"] = df["preco_num"].apply(
        lambda v: f"R$ {v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    )
    df = df.sort_values(by="preco_num", ascending=True).reset_index(drop=True)
    df["link"] = df["link"].fillna("")
    df["imagem_url"] = df["imagem_url"].fillna("")

    return df


def filtrar_por_faixa_preco(
    df: pd.DataFrame,
    preco_min: float,
    preco_max: float
) -> pd.DataFrame:
    """Aplica o filtro de faixa de preço estritamente após o scraping e limpeza."""
    if df.empty:
        return df
    condicao = (df["preco_num"] >= preco_min) & (df["preco_num"] <= preco_max)
    return df[condicao].reset_index(drop=True)


# =============================================================================
# 6. RENDERIZAÇÃO DA INTERFACE WEB STREAMLIT
# =============================================================================

def aplicar_estilos_css():
    st.markdown(
        """
        <style>
        .stApp {
            background-color: #2B2C30 !important;
            color: #F3F4F6 !important;
        }
        header[data-testid="stHeader"] {
            background-color: rgba(43, 44, 48, 0.9) !important;
        }
        div[data-testid="stTextInput"] input {
            background-color: #1F2023 !important;
            color: #FFFFFF !important;
            font-size: 1.15rem !important;
            padding: 0.85rem 1rem !important;
            border-radius: 10px !important;
            border: 1.5px solid #45474E !important;
        }
        div[data-testid="stButton"] button {
            background: linear-gradient(135deg, #FF4747 0%, #D82C2C 100%) !important;
            color: #FFFFFF !important;
            font-size: 1.15rem !important;
            font-weight: 600 !important;
            padding: 0.75rem 2rem !important;
            border-radius: 10px !important;
        }
        div[data-testid="stDataFrame"] {
            background-color: #36383E !important;
            border-radius: 12px !important;
            border: 1px solid #4A4D55 !important;
        }
        div[data-testid="stDataFrame"] div[role="grid"] {
            font-size: 1.05rem !important;
        }
        .card-produto {
            background-color: #36383E;
            border: 1px solid #484B52;
            border-radius: 12px;
            padding: 1rem;
            margin-bottom: 1rem;
            display: flex;
            align-items: center;
            gap: 1.25rem;
        }
        .card-preco {
            font-size: 1.35rem;
            font-weight: 700;
            color: #34D399;
            font-family: monospace;
        }
        </style>
        """,
        unsafe_allow_html=True,
    )


def executar_fluxo_mineracao(termo: str, num_scrolls: int):
    status_box = st.empty()
    barra_progresso = st.progress(0)

    def atualizar_status(msg: str):
        status_box.info(f"⏳ **Status:** {msg}")

    try:
        inicio_tempo = time.time()
        atualizar_status("Iniciando navegador com Playwright & Stealth Shield...")
        barra_progresso.progress(15)

        dados_brutos = extrair_dados(
            termo_busca=termo,
            scrolls=num_scrolls,
            callback_status=atualizar_status,
            headless=HEADLESS_MODE,
        )
        barra_progresso.progress(70)

        atualizar_status("Limpando dados monetários e ordenando com Pandas...")
        barra_progresso.progress(85)
        df_resultado = limpar_dados(dados_brutos)

        tempo_total = round(time.time() - inicio_tempo, 2)
        barra_progresso.progress(100)
        time.sleep(0.4)
        status_box.empty()
        barra_progresso.empty()

        menor = df_resultado["preco_num"].min() if not df_resultado.empty else None

        # Salva a busca no histórico local JSON
        salvar_busca_historico(
            termo=termo,
            total_produtos=len(df_resultado),
            menor_preco=float(menor) if menor is not None else None,
        )

        st.session_state["ultimo_df"] = df_resultado
        st.session_state["ultimo_termo"] = termo
        st.session_state["tempo_execucao"] = tempo_total
        st.session_state["total_bruto"] = len(dados_brutos)

    except Exception as e:
        status_box.empty()
        barra_progresso.empty()
        st.error(f"❌ Ocorreu um erro durante a mineração: {str(e)}")


def renderizar_ui():
    st.set_page_config(
        page_title="Minerador AliExpress",
        page_icon="⛏️",
        layout="wide",
        initial_sidebar_state="expanded",
    )

    aplicar_estilos_css()

    # Sidebar com Histórico de Buscas Salvas
    with st.sidebar:
        st.markdown("### 🕒 Histórico de Buscas")
        st.caption("Salvo no arquivo local historico_buscas.json")

        historico = carregar_historico()
        if historico:
            for item in historico:
                termo_hist = item.get("termo", "")
                data_hist = item.get("data_hora", "")
                total_hist = item.get("total_produtos", 0)
                menor_hist = item.get("menor_preco")
                preco_label = f" (Menor: R$ {menor_hist:,.2f})" if menor_hist else ""

                if st.button(f"🔍 {termo_hist}", key=f"hist_{termo_hist}"):
                    st.session_state["input_busca_valor"] = termo_hist
                    executar_fluxo_mineracao(termo=termo_hist, num_scrolls=5)
                    st.rerun()
                st.caption(f"{data_hist} · {total_hist} itens{preco_label}")

            st.markdown("---")
            if st.button("🗑️ Limpar Histórico", use_container_width=True):
                limpar_historico_local()
                st.success("Histórico limpo!")
                st.rerun()
        else:
            st.info("Nenhuma busca salva no histórico.")

    st.title("⛏️ Minerador AliExpress")
    st.markdown(
        "<p style='font-size: 1.15rem; color: #9CA3AF;'>"
        "Scraping automatizado com <strong>Playwright Stealth</strong>, filtro de preço dinâmico "
        "e ordenação rigorosa por <strong>menor preço</strong>.</p>",
        unsafe_allow_html=True,
    )

    col_input, col_scroll, col_btn = st.columns([5, 2, 2], vertical_alignment="bottom")

    with col_input:
        termo_busca = st.text_input(
            "Termo de Busca:",
            value=st.session_state.get("input_busca_valor", ""),
            placeholder="Ex: Fone Bluetooth, Smartwatch AMOLED, Drone 4K...",
            key="input_busca_principal",
        )

    with col_scroll:
        num_scrolls = st.selectbox(
            "Rolagens (Lazy-load):",
            options=[5, 7, 10, 15],
            index=0,
        )

    with col_btn:
        executar_busca = st.button("🔍 Minerar Ofertas", use_container_width=True)

    if executar_busca:
        if not termo_busca or not termo_busca.strip():
            st.warning("⚠️ Digite um termo de busca válido.")
            return
        st.session_state["input_busca_valor"] = termo_busca.strip()
        executar_fluxo_mineracao(termo=termo_busca.strip(), num_scrolls=num_scrolls)

    # Exibição de Resultados e Filtros de Preço
    if "ultimo_df" in st.session_state and st.session_state["ultimo_df"] is not None:
        df_original = st.session_state["ultimo_df"]
        termo = st.session_state.get("ultimo_termo", "")
        tempo = st.session_state.get("tempo_execucao", 0)
        total_bruto = st.session_state.get("total_bruto", 0)

        if df_original.empty:
            st.warning(f"Nenhum produto válido encontrado para '{termo}'.")
            return

        min_abs = float(df_original["preco_num"].min())
        max_abs = float(df_original["preco_num"].max())
        margem_max = max_abs if max_abs > min_abs else min_abs + 10.0

        # Filtro de Faixa de Preço (Aplicado após scraping e limpeza)
        st.markdown("---")
        st.subheader("🎯 Filtrar Resultados por Faixa de Preço")
        col_slider, col_n1, col_n2 = st.columns([5, 2, 2], vertical_alignment="center")

        with col_slider:
            faixa = st.slider(
                "Faixa de Preço (R$):",
                min_value=round(min_abs, 2),
                max_value=round(margem_max, 2),
                value=(round(min_abs, 2), round(margem_max, 2)),
            )

        with col_n1:
            p_min = st.number_input("Mínimo (R$):", value=float(faixa[0]))

        with col_n2:
            p_max = st.number_input("Máximo (R$):", value=float(faixa[1]))

        # Aplica o filtro no DataFrame
        df_filtrado = filtrar_por_faixa_preco(df_original, min(p_min, faixa[0]), max(p_max, faixa[1]))

        # Métricas
        m1, m2, m3, m4 = st.columns(4)
        menor_val = df_filtrado["preco_num"].min() if not df_filtrado.empty else 0
        medio_val = df_filtrado["preco_num"].mean() if not df_filtrado.empty else 0

        with m1:
            st.metric("🏆 Menor Preço (Na Faixa)", f"R$ {menor_val:,.2f}")
        with m2:
            st.metric("📊 Preço Médio (Na Faixa)", f"R$ {medio_val:,.2f}")
        with m3:
            st.metric("📦 Produtos na Faixa", f"{len(df_filtrado)} de {len(df_original)}")
        with m4:
            st.metric("⚡ Tempo Total", f"{tempo}s")

        st.dataframe(
            df_filtrado[["titulo", "preco_formatado", "preco_bruto", "link"]],
            hide_index=False,
            use_container_width=True,
        )

        # Seção de Comparação Lado a Lado
        st.markdown("---")
        st.subheader("⚖️ Comparar Produtos Lado a Lado")
        opcoes_titulos = df_filtrado["titulo"].tolist()
        itens_selecionados = st.multiselect(
            "Selecione dois ou mais produtos para comparar:",
            options=opcoes_titulos,
            default=opcoes_titulos[:2] if len(opcoes_titulos) >= 2 else opcoes_titulos,
            key="comp_multiselect"
        )
        if itens_selecionados and len(itens_selecionados) >= 2:
            df_comp = df_filtrado[df_filtrado["titulo"].isin(itens_selecionados)].sort_values(by="preco_num")
            menor_c = df_comp["preco_num"].min()
            st.info(f"Comparando {len(df_comp)} itens. Menor valor do grupo: R$ {menor_c:,.2f}")
            cols = st.columns(len(df_comp))
            for i, (_, prod) in enumerate(df_comp.iterrows()):
                with cols[i]:
                    e_menor = prod["preco_num"] == menor_c
                    diff = prod["preco_num"] - menor_c
                    st.markdown(f"**{'🏆 ' if e_menor else ''}{prod['titulo'][:50]}...**")
                    st.metric("Preço", prod["preco_formatado"], delta=None if e_menor else f"+R$ {diff:,.2f}")
                    if prod["link"]:
                        st.markdown(f"[Ver no AliExpress]({prod['link']})")


if __name__ == "__main__":
    renderizar_ui()
`;

export const REQUIREMENTS_TXT_CONTENT = `streamlit>=1.35.0
playwright>=1.44.0
playwright-stealth>=1.0.6
pandas>=2.2.0
beautifulsoup4>=4.12.3
openpyxl>=3.1.2
`;
