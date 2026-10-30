```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
===============================================================================
PROJETO: Minerador AliExpress (Web Scraping, Filtro de Preço & Histórico)
AUTOR: Engenheiro de Software Sênior especialista em Web Scraping e Python
STACK: Python 3.11+, Streamlit, Playwright, Playwright-Stealth, Pandas, Regex
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

# Hack para Streamlit Cloud: Instala o Chromium do Playwright automaticamente
os.system("playwright install chromium")

import streamlit as st
import pandas as pd
from playwright.sync_api import sync_playwright, Browser, BrowserContext, Page
from playwright_stealth import stealth_sync

# =============================================================================
# 1. CONFIGURAÇÕES GERAIS, ARQUIVOS LOCAIS E CONSTANTES ANTI-BOT
# =============================================================================

HEADLESS_MODE = os.getenv("HEADLESS", "true").strip().lower() in ("true", "1", "yes")
ARQUIVO_HISTORICO = os.getenv("HISTORICO_PATH", "historico_buscas.json")
URL_BASE_ALIEXPRESS = "https://pt.aliexpress.com/wholesale?SearchText={termo}"

USER_AGENT_PADRAO = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

# =============================================================================
# ⚠️ MAPA DE SELETORES CSS DO ALIEXPRESS (ATUALIZADO)
# =============================================================================

SELETORES_CARD = [
    "div[class*='multi--content--']",
    "div[class*='search-item-card']",
    "div[class*='list--galleryWrap--'] > div",
    "div[class*='search-card-item']",
    "div.search-item-card-wrapper-gallery",
    "a[class*='multi--container--']",
    "div[data-spm-anchor-id*='wholesale']",
    "a[href*='/item/']",
    "div[class*='search-item']"
]

SELETORES_TITULO = [
    "h3[class*='multi--titleText--']",
    "div[class*='multi--title--']",
    "h1[class*='multi--titleText--']",
    "div[class*='search-card-item'] h3",
    "span[class*='title--title--']",
    "a[class*='multi--title--']",
    "h3",
]

SELETORES_PRECO = [
    "div[class*='multi--price-sale--']",
    "div[class*='price--currentPrice--']",
    "div[class*='multi--price--']",
    "span[class*='price--salePrice--']",
    "span[class*='multi--price-sale--']",
    "div[class*='price--current--']",
    "div[class*='multi--main--'] span",
    "div[class*='price']",
    "span[class*='price']",
    ".manhattan--price-sale--1CCSZfK"
]

SELETORES_LINK = [
    "a[href*='/item/']",
    "a[class*='multi--container--']",
    "a[class*='multi--title--']",
    "a",
]

SELETORES_IMAGEM = [
    "img[class*='multi--image--']",
    "img[class*='mainImage']",
    "div[class*='multi--image--'] img",
    "img[src*='aliexpress-media']",
    "img[src*='alicdn']",
    "img",
]

# =============================================================================
# 2. GERENCIAMENTO DO HISTÓRICO DE BUSCAS LOCAL
# =============================================================================

def carregar_historico() -> List[Dict[str, Any]]:
    if not os.path.exists(ARQUIVO_HISTORICO): return []
    try:
        with open(ARQUIVO_HISTORICO, "r", encoding="utf-8") as f:
            dados = json.load(f)
            if isinstance(dados, list): return dados
    except Exception: pass
    return []

def salvar_busca_historico(termo: str, total_produtos: int = 0, menor_preco: Optional[float] = None) -> None:
    termo_limpo = termo.strip()
    if not termo_limpo: return
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
    try:
        if os.path.exists(ARQUIVO_HISTORICO):
            os.remove(ARQUIVO_HISTORICO)
        return True
    except Exception: return False

# =============================================================================
# 3. INFRAESTRUTURA DE NAVEGAÇÃO E ANTI-BOT
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
    browser: Browser = p.chromium.launch(headless=headless, args=argumentos_chromium)
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
            callback_status(f"Rolando a página ({pixels}px) [Passo {i}/{scrolls}] com pausas aleatórias...")
        page.evaluate(f"window.scrollTo(0, {pixels});")
        pausa = random.uniform(1.5, 3.5)
        time.sleep(pausa)

# =============================================================================
# 4. EXTRAÇÃO DE DADOS DO DOM
# =============================================================================

def extrair_dados(termo_busca: str, scrolls: int = 5, callback_status=None, headless: bool = HEADLESS_MODE) -> List[Dict[str, Any]]:
    termo_codificado = urllib.parse.quote(termo_busca.strip())
    url_alvo = URL_BASE_ALIEXPRESS.format(termo=termo_codificado)
    produtos_brutos: List[Dict[str, Any]] = []

    if callback_status: callback_status("Iniciando navegador com Playwright & Stealth Shield...")

    with sync_playwright() as p:
        browser, context, page = iniciar_browser(p, headless=headless)
        try:
            if callback_status: callback_status(f"Navegando para AliExpress: '{termo_busca}'...")
            page.goto(url_alvo, wait_until="domcontentloaded", timeout=45000)
            
            try:
                page.wait_for_selector(", ".join(SELETORES_CARD), timeout=10000, state="attached")
            except Exception:
                time.sleep(2.0)

            rolar_pagina_suave(page, scrolls=scrolls, callback_status=callback_status)

            if callback_status: callback_status("Extraindo cards de produtos do DOM...")

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
                    # 1. Título
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

                    # 2. Preço
                    preco_bruto = ""
                    for s_preco in SELETORES_PRECO:
                        el_preco = card.query_selector(s_preco)
                        if el_preco:
                            texto_preco = el_preco.inner_text().strip()
                            if texto_preco and any(char.isdigit() for char in texto_preco):
                                preco_bruto = texto_preco
                                break

                    # 3. Link
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

                    # 4. Imagem
                    imagem_url = ""
                    for s_img in SELETORES_IMAGEM:
                        el_img = card.query_selector(s_img)
                        if el_img:
                            src = el_img.get_attribute("src") or el_img.get_attribute("data-src") or el_img.get_attribute("srcset")
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

def titulo_valido(titulo: str, termo_busca: str) -> bool:
    """Verifica se especificações cruciais da busca existem no título retornado."""
    titulo_lower = titulo.lower().replace(" ", "")
    specs_buscadas = re.findall(r'\d+(?:tb|gb|mah|w|v)', termo_busca.lower().replace(" ", ""))
    
    for spec in specs_buscadas:
        if spec not in titulo_lower:
            return False
    return True

def limpar_preco_string(preco_str: Any) -> Optional[float]:
    """Higieniza a string ignorando moedas (R$, US$) e foca nos decimais."""
    if not preco_str or not isinstance(preco_str, str): return None
    texto = preco_str.strip()
    
    numeros = re.findall(r'[\d,.]+', texto)
    if not numeros: return None
    
    preco_limpo = numeros[0]
    
    if '.' in preco_limpo and ',' in preco_limpo:
        preco_limpo = preco_limpo.replace('.', '').replace(',', '.')
    elif ',' in preco_limpo:
        preco_limpo = preco_limpo.replace(',', '.')
        
    try:
        valor_float = float(preco_limpo)
        return round(valor_float, 2) if valor_float > 0 else None
    except ValueError:
        return None

def formatar_moeda_brl(valor: float) -> str:
    try:
        return f"R$ {valor:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    except Exception:
        return f"R$ {valor}"

def limpar_dados(dados_brutos: List[Dict[str, Any]], termo_busca: str) -> pd.DataFrame:
    if not dados_brutos:
        return pd.DataFrame(columns=["titulo", "preco_num", "preco_formatado", "preco_bruto", "link", "imagem_url"])

    df = pd.DataFrame(dados_brutos)
    df["preco_num"] = df["preco_bruto"].apply(limpar_preco_string)
    df = df.dropna(subset=["preco_num"])
    df = df[df["preco_num"] > 0]
    
    if df.empty:
        return pd.DataFrame(columns=["titulo", "preco_num", "preco_formatado", "preco_bruto", "link", "imagem_url"])

    df["titulo_valido"] = df["titulo"].apply(lambda t: titulo_valido(t, termo_busca))
    df = df[df["titulo_valido"] == True].drop(columns=["titulo_valido"])
    
    if df.empty:
        return pd.DataFrame(columns=["titulo", "preco_num", "preco_formatado", "preco_bruto", "link", "imagem_url"])

    df["preco_formatado"] = df["preco_num"].apply(formatar_moeda_brl)
    df = df.sort_values(by="preco_num", ascending=True).reset_index(drop=True)
    df["link"] = df["link"].fillna("")
    df["imagem_url"] = df["imagem_url"].fillna("")

    return df

def filtrar_por_faixa_preco(df: pd.DataFrame, preco_min: float, preco_max: float) -> pd.DataFrame:
    if df.empty: return df
    condicao = (df["preco_num"] >= preco_min) & (df["preco_num"] <= preco_max)
    return df[condicao].reset_index(drop=True)

# =============================================================================
# 6. RENDERIZAÇÃO DA INTERFACE WEB STREAMLIT
# =============================================================================

def aplicar_estilos_css():
    st.markdown(
        """
        <style>
        .stApp { background-color: #2B2C30 !important; color: #F3F4F6 !important; font-family: sans-serif; }
        header[data-testid="stHeader"] { background-color: rgba(43, 44, 48, 0.9) !important; }
        h1, h2, h3 { color: #FFFFFF !important; font-weight: 700 !important; }
        div[data-testid="stTextInput"] input { background-color: #1F2023 !important; color: #FFFFFF !important; font-size: 1.15rem !important; padding: 0.85rem 1rem !important; border-radius: 10px !important; border: 1.5px solid #45474E !important; }
        div[data-testid="stTextInput"] input:focus { border-color: #FF4747 !important; box-shadow: 0 0 0 2px rgba(255, 71, 71, 0.25) !important; }
        div[data-testid="stNumberInput"] input { background-color: #1F2023 !important; color: #FFFFFF !important; font-size: 1.1rem !important; border-radius: 8px !important; border: 1px solid #45474E !important; }
        div[data-testid="stButton"] button { background: linear-gradient(135deg, #FF4747 0%, #D82C2C 100%) !important; color: #FFFFFF !important; font-size: 1.15rem !important; font-weight: 600 !important; padding: 0.75rem 2rem !important; border-radius: 10px !important; border: none !important; width: 100% !important; transition: all 0.2s ease !important; }
        div[data-testid="stButton"] button:hover { transform: translateY(-1px) !important; box-shadow: 0 6px 20px rgba(255, 71, 71, 0.35) !important; }
        div[data-testid="stDataFrame"] { background-color: #36383E !important; border-radius: 12px !important; border: 1px solid #4A4D55 !important; padding: 0.5rem !important; }
        .card-produto { background-color: #36383E; border: 1px solid #484B52; border-radius: 12px; padding: 1rem; margin-bottom: 1rem; display: flex; align-items: center; gap: 1.25rem; transition: transform 0.2s ease; }
        .card-produto:hover { border-color: #FF4747; transform: translateY(-2px); }
        .card-img { width: 90px; height: 90px; border-radius: 8px; object-fit: cover; background-color: #1F2023; flex-shrink: 0; }
        .card-info { flex-grow: 1; min-width: 0; }
        .card-titulo { font-size: 1.05rem; font-weight: 600; color: #FFFFFF; margin-bottom: 0.35rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .card-preco { font-size: 1.35rem; font-weight: 700; color: #34D399; font-family: monospace; }
        .card-preco-bruto { font-size: 0.85rem; color: #9CA3AF; margin-left: 0.5rem; }
        .card-btn { background-color: #484B52; color: #FFFFFF !important; padding: 0.5rem 1rem; border-radius: 6px; font-size: 0.95rem; font-weight: 600; text-decoration: none !important; white-space: nowrap; }
        .card-btn:hover { background-color: #FF4747; }
        div[data-testid="stMetric"] { background-color: #36383E !important; border: 1px solid #484B52 !important; padding: 1rem !important; border-radius: 10px !important; }
        div[data-testid="stMetricValue"] { font-size: 1.6rem !important; color: #FFFFFF !important; font-weight: 700 !important; }
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

        dados_brutos = extrair_dados(termo_busca=termo, scrolls=num_scrolls, callback_status=atualizar_status, headless=HEADLESS_MODE)
        barra_progresso.progress(70)

        atualizar_status("Limpando dados monetários e ordenando com Pandas...")
        barra_progresso.progress(85)
        
        # Passando o termo para filtrar as variações falsas (Ex: SSD 128GB aparecendo na busca de 2TB)
        df_resultado = limpar_dados(dados_brutos, termo)

        tempo_total = round(time.time() - inicio_tempo, 2)
        barra_progresso.progress(100)
        time.sleep(0.4)
        status_box.empty()
        barra_progresso.empty()

        menor = df_resultado["preco_num"].min() if not df_resultado.empty else None

        salvar_busca_historico(termo=termo, total_produtos=len(df_resultado), menor_preco=float(menor) if menor is not None else None)

        st.session_state["ultimo_df"] = df_resultado
        st.session_state["ultimo_termo"] = termo
        st.session_state["tempo_execucao"] = tempo_total
        st.session_state["total_bruto"] = len(dados_brutos)

        if not df_resultado.empty:
            st.session_state["min_filtro_atual"] = float(df_resultado["preco_num"].min())
            st.session_state["max_filtro_atual"] = float(df_resultado["preco_num"].max())

    except Exception as e:
        status_box.empty()
        barra_progresso.empty()
        st.error(f"❌ Ocorreu um erro durante a mineração: {str(e)}")

def renderizar_ui():
    st.set_page_config(page_title="Minerador AliExpress", page_icon="⛏️", layout="wide", initial_sidebar_state="expanded")
    aplicar_estilos_css()

    if "input_busca_valor" not in st.session_state:
        st.session_state["input_busca_valor"] = ""

    with st.sidebar:
        st.markdown("### 🕒 Histórico de Buscas")
        historico = carregar_historico()
        if historico:
            for item in historico:
                termo_hist = item.get("termo", "")
                menor_hist = item.get("menor_preco")
                preco_label = f" (Menor: R$ {menor_hist:,.2f})" if menor_hist else ""
                if st.button(f"🔍 {termo_hist}", key=f"hist_{termo_hist}"):
                    st.session_state["input_busca_valor"] = termo_hist
                    executar_fluxo_mineracao(termo=termo_hist, num_scrolls=5)
                    st.rerun()
                st.caption(f"{item.get('data_hora', '')} · {item.get('total_produtos', 0)} itens{preco_label}")
            if st.button("🗑️ Limpar Histórico", use_container_width=True):
                limpar_historico_local()
                st.rerun()
        else:
            st.info("Nenhuma busca salva ainda no histórico.")

    col_t1, _ = st.columns([4, 1])
    with col_t1:
        st.title("⛏️ Minerador AliExpress")

    with st.container():
        col_input, col_scroll, col_btn = st.columns([5, 2, 2], vertical_alignment="bottom")
        with col_input:
            termo_busca = st.text_input("Termo de Busca:", value=st.session_state.get("input_busca_valor", ""), key="input_busca_principal")
        with col_scroll:
            num_scrolls = st.selectbox("Rolagens (Lazy-load):", options=[5, 7, 10, 15], index=0)
        with col_btn:
            executar_busca = st.button("🔍 Minerar Ofertas", use_container_width=True)

    if executar_busca:
        if termo_busca.strip():
            st.session_state["input_busca_valor"] = termo_busca.strip()
            executar_fluxo_mineracao(termo=termo_busca.strip(), num_scrolls=num_scrolls)

    if "ultimo_df" in st.session_state and st.session_state["ultimo_df"] is not None:
        df_original = st.session_state["ultimo_df"]
        termo = st.session_state.get("ultimo_termo", "")
        
        if df_original.empty:
            st.warning("Nenhum produto válido encontrado. Tente aumentar as rolagens ou remover especificações muito restritas.")
            return

        min_absoluto = float(df_original["preco_num"].min())
        max_absoluto = float(df_original["preco_num"].max())
        step_valor = 1.0 if (max_absoluto - min_absoluto) > 10 else 0.1
        margem_max = max_absoluto if max_absoluto > min_absoluto else min_absoluto + 10.0

        st.markdown("<hr style='border-color: #484B52; margin: 1.5rem 0;'>", unsafe_allow_html=True)
        col_slider, col_num_min, col_num_max = st.columns([5, 2, 2], vertical_alignment="center")
        
        with col_slider:
            faixa_preco = st.slider("Faixa de Preço (R$):", min_value=round(min_absoluto, 2), max_value=round(margem_max, 2), value=(round(st.session_state.get("min_filtro_atual", min_absoluto), 2), round(st.session_state.get("max_filtro_atual", margem_max), 2)), step=step_valor)
        with col_num_min:
            preco_min_input = st.number_input("Mínimo (R$):", min_value=0.0, value=float(faixa_preco[0]), step=step_valor)
        with col_num_max:
            preco_max_input = st.number_input("Máximo (R$):", min_value=0.0, value=float(faixa_preco[1]), step=step_valor)

        df_filtrado = filtrar_por_faixa_preco(df_original, min(preco_min_input, faixa_preco[0]), max(preco_max_input, faixa_preco[1]))

        m1, m2, m3, m4 = st.columns(4)
        menor_f = df_filtrado["preco_num"].min() if not df_filtrado.empty else 0.0
        with m1: st.metric("🏆 Menor Preço", f"R$ {menor_f:,.2f}".replace(",", "X").replace(".", ",").replace("X", "."))
        with m2: st.metric("📦 Produtos", f"{len(df_filtrado)} de {len(df_original)}")
        with m4: st.metric("⚡ Tempo Scraping", f"{st.session_state.get('tempo_execucao', 0)}s")

        col_view, col_down_csv, _ = st.columns([4, 2, 2], vertical_alignment="center")
        with col_view: tipo_visualizacao = st.radio("Modo de Visualização:", options=["Cards com Miniatura", "Tabela Completa (DataFrame)"], horizontal=True)
        with col_down_csv: st.download_button("📥 Baixar CSV", data=df_filtrado.to_csv(index=False, sep=";").encode("utf-8"), file_name=f"ali_{termo}.csv", mime="text/csv", use_container_width=True)

        if not df_filtrado.empty:
            st.markdown("<hr style='border-color: #484B52; margin: 1.5rem 0;'>", unsafe_allow_html=True)
            opcoes_titulos = df_filtrado["titulo"].tolist()
            itens_selecionados = st.multiselect("⚖️ Comparar Produtos:", options=opcoes_titulos, default=opcoes_titulos[:2] if len(opcoes_titulos) >= 2 else opcoes_titulos)

            if itens_selecionados and len(itens_selecionados) >= 2:
                df_comp = df_filtrado[df_filtrado["titulo"].isin(itens_selecionados)].copy().sort_values(by="preco_num", ascending=True)
                menor_comp = df_comp["preco_num"].min()
                colunas_comp = st.columns(len(df_comp))
                
                for i, (_, p_comp) in enumerate(df_comp.iterrows()):
                    with colunas_comp[i]:
                        e_menor = p_comp["preco_num"] == menor_comp
                        diff = p_comp["preco_num"] - menor_comp
                        pct = (diff / menor_comp) * 100 if menor_comp > 0 else 0
                        
                        borda = "border: 2px solid #34D399;" if e_menor else "border: 1px solid #484B52;"
                        badge_campeao = "<div style='background-color:#064E3B;color:#34D399;padding:4px 8px;border-radius:6px;font-weight:700;font-size:0.8rem;text-align:center;margin-bottom:8px;'>🏆 MENOR PREÇO</div>" if e_menor else f"<div style='background-color:#242528;color:#FBBF24;padding:4px 8px;border-radius:6px;font-size:0.8rem;text-align:center;margin-bottom:8px;'>+R$ {diff:,.2f} (+{pct:.0f}%)</div>"
                        img_html = f"<img src='{p_comp['imagem_url']}' style='width:100%;height:140px;object-fit:cover;border-radius:8px;margin-bottom:8px;' />" if p_comp["imagem_url"] else "<div style='height:140px;display:flex;align-items:center;justify-content:center;background:#1F2023;border-radius:8px;color:#6B7280;margin-bottom:8px;'>Sem foto</div>"
                        
                        st.markdown(f"<div style='background-color:#36383E;{borda}border-radius:12px;padding:12px;height:100%;display:flex;flex-direction:column;'>{badge_campeao}{img_html}<div style='font-size:1.4rem;font-weight:700;color:#34D399;'>{p_comp['preco_formatado']}</div><div style='font-size:0.8rem;color:#9CA3AF;margin-bottom:8px;'>Bruto: {p_comp['preco_bruto']}</div><div style='font-size:0.95rem;color:#FFFFFF;margin-bottom:12px;'>{p_comp['titulo']}</div><div style='margin-top:auto;'><a href='{p_comp['link']}' target='_blank' style='display:block;background-color:#FF4747;color:#FFFFFF;text-align:center;padding:8px;border-radius:6px;text-decoration:none;'>Ver no AliExpress ↗</a></div></div>", unsafe_allow_html=True)
                st.markdown("<hr style='border-color: #484B52; margin: 1.5rem 0;'>", unsafe_allow_html=True)

            if tipo_visualizacao == "Cards com Miniatura":
                for idx, row in df_filtrado.iterrows():
                    img_tag = f"<img src='{row['imagem_url']}' class='card-img' />" if row["imagem_url"] else "<div class='card-img'>Sem foto</div>"
                    link_btn = f"<a href='{row['link']}' target='_blank' class='card-btn'>Ver ↗</a>" if row["link"] else "<span>Sem link</span>"
                    st.markdown(f"<div class='card-produto'>{img_tag}<div class='card-info'><div class='card-titulo'>{idx + 1}. {row['titulo']}</div><div><span class='card-preco'>{row['preco_formatado']}</span><span class='card-preco-bruto'>({row['preco_bruto']})</span></div></div><div>{link_btn}</div></div>", unsafe_allow_html=True)
            else:
                st.dataframe(df_filtrado[["titulo", "preco_formatado", "link"]], use_container_width=True)

if __name__ == "__main__":
    renderizar_ui()

```
