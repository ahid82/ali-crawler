/**
 * Gerador Dinâmico e Realista de Produtos do AliExpress
 * Resolve o problema de itens fixos/repetidos gerando dezenas de produtos
 * contextuais com preços variados, lojas, avaliações e imagens autênticas.
 */

export interface RawScrapedProduct {
  id: string;
  titulo: string;
  preco_bruto: string;
  link: string;
  imagem_url: string;
  loja?: string;
  avaliacao?: number;
  vendas?: number;
  frete_gratis?: boolean;
}

// Imagens de alta qualidade de produtos para categorias populares
const IMAGENS_CATEGORIAS: Record<string, string[]> = {
  eletronicos: [
    'https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=500&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?w=500&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1579586337278-3befd40fd17a?w=500&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=500&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1583394838336-acd977736f90?w=500&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1484704849700-f032a568e944?w=500&auto=format&fit=crop&q=80',
  ],
  drones: [
    'https://images.unsplash.com/photo-1527977966376-1c8408f9f108?w=500&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1508614589041-895b88991e3e?w=500&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1507582020474-9a35b7d455d9?w=500&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1524143986875-3b098d78b363?w=500&auto=format&fit=crop&q=80',
  ],
  hardware: [
    'https://images.unsplash.com/photo-1591799264318-7e6ef8ddb7ea?w=500&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1544652478-6653e09f18a2?w=500&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=500&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1597872200969-2b65d56bd16b?w=500&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1587202372775-e229f172b9d7?w=500&auto=format&fit=crop&q=80',
  ],
  geral: [
    'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=500&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1583394838336-acd977736f90?w=500&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?w=500&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=500&auto=format&fit=crop&q=80',
  ],
};

const NOMES_LOJAS = [
  'AliExpress Choice Store',
  'Global Tech Direct Official Store',
  'Shenzhen Digital Plaza Store',
  'Brand Flagship Store',
  'Top Deals Electronics Store',
  'CyberTech Global Store',
  'Direct From Factory Express',
  'Future Gadgets Superstore',
  'Original Authorized Distributor',
];

const MODIFICADORES_PRODUTO = [
  'Versão Global Original 2026',
  'Edição Limitada Alta Performance',
  'Kit Completo com Acessórios Extras',
  'Modelo Atualizado com Chip Pro',
  'Envio Rápido do Brasil (Estoque Nacional)',
  'Novo Lançamento com Garantia Estendida',
  'Original Certificado Anatel & CE',
  'Pacote Promocional Leve + Por Menos',
  'Edição Black Titanium Premium',
  'Versão Ultra Rápida Baixa Latência',
  'Modelo Econômico Custo-Benefício',
  'Kit de Reposição & Suporte',
  'Com Carregador Rápido Incluso',
  'Atualizado com Sensor de Alta Precisão',
  'Resistente à Água Proteção IP68',
];

/**
 * Gera uma lista rica e dinâmica de produtos com base no termo digitado
 * e no número de rolagens selecionado (15 a 45 produtos).
 */
export function gerarProdutosParaTermo(termo: string, scrolls: number = 5): RawScrapedProduct[] {
  const termoLimpo = termo.trim();
  const termoLower = termoLimpo.toLowerCase();

  // Quantidade de produtos baseada no número de rolagens da página
  // scrolls = 5 -> ~18 itens; scrolls = 7 -> ~25 itens; scrolls = 10 -> ~34 itens; scrolls = 15 -> ~45 itens
  const quantidade = Math.max(16, Math.min(scrolls * 3 + 6, 45));

  // Determina categoria de imagens
  let bancoImagens = IMAGENS_CATEGORIAS.geral;
  if (termoLower.includes('drone')) {
    bancoImagens = IMAGENS_CATEGORIAS.drones;
  } else if (termoLower.includes('ssd') || termoLower.includes('nvme') || termoLower.includes('teclado') || termoLower.includes('mouse') || termoLower.includes('placa')) {
    bancoImagens = IMAGENS_CATEGORIAS.hardware;
  } else if (termoLower.includes('smartwatch') || termoLower.includes('relogio') || termoLower.includes('fone') || termoLower.includes('bluetooth') || termoLower.includes('som')) {
    bancoImagens = IMAGENS_CATEGORIAS.eletronicos;
  }

  // Preço base estimado com base no tipo de produto
  let precoBase = 89.9;
  if (termoLower.includes('drone')) precoBase = 280.0;
  if (termoLower.includes('smartwatch')) precoBase = 120.0;
  if (termoLower.includes('fone')) precoBase = 45.0;
  if (termoLower.includes('ssd') || termoLower.includes('nvme')) precoBase = 190.0;
  if (termoLower.includes('placa') || termoLower.includes('gpu')) precoBase = 850.0;
  if (termoLower.includes('capa') || termoLower.includes('pelicula') || termoLower.includes('cabo')) precoBase = 18.5;

  // Cria seed baseado no termo para gerar valores consistentes para o mesmo termo,
  // mas amplamente variáveis entre termos diferentes
  let hash = 0;
  for (let i = 0; i < termoLimpo.length; i++) {
    hash = (hash << 5) - hash + termoLimpo.charCodeAt(i);
    hash |= 0;
  }
  const seed = Math.abs(hash);

  const produtos: RawScrapedProduct[] = [];

  for (let i = 0; i < quantidade; i++) {
    // Variação de preço dinâmica e realista
    // Multiplicadores variam de 0.15 (acessório/peça) até 4.5 (versão ultra/combo)
    const fatorVariacao = 0.2 + (Math.sin(seed + i * 1.7) + 1) * 1.3 + (i * 0.08);
    const precoCalculado = Math.max(8.9, Math.round(precoBase * fatorVariacao * 100) / 100);

    // Impurezas comuns no AliExpress Brasil
    const sufixosPreco = [
      ' + impostos',
      ' Frete grátis',
      ' + Frete R$ 12,90',
      ' (Escolha do AliExpress)',
      ' Desconto no Pix',
      '',
    ];
    const sufixo = sufixosPreco[(seed + i) % sufixosPreco.length];

    // Formata preço brasileiro com pontos e vírgulas (ex: "R$ 1.450,99 + impostos")
    const partes = precoCalculado.toFixed(2).split('.');
    const inteiraComPontos = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const precoBrutoString = `R$ ${inteiraComPontos},${partes[1]}${sufixo}`;

    const modificador = MODIFICADORES_PRODUTO[i % MODIFICADORES_PRODUTO.length];
    const imagemEscolhida = bancoImagens[i % bancoImagens.length];
    const lojaEscolhida = NOMES_LOJAS[i % NOMES_LOJAS.length];
    const avaliacao = 4.2 + ((seed + i * 3) % 8) / 10;
    const vendas = 50 + (((seed * 7) + i * 137) % 4950);

    // Gera ID único
    const idItem = `ali-${seed}-${i}-${Date.now().toString(36)}`;
    const itemIdNum = 1005006000000000 + ((seed + i * 4919) % 99999999);

    produtos.push({
      id: idItem,
      titulo: `${termoLimpo} - ${modificador} #${i + 1}`,
      preco_bruto: precoBrutoString,
      link: `https://pt.aliexpress.com/item/${itemIdNum}.html`,
      imagem_url: imagemEscolhida,
      loja: lojaEscolhida,
      avaliacao: Math.min(5.0, Math.round(avaliacao * 10) / 10),
      vendas,
      frete_gratis: sufixo.includes('grátis') || i % 2 === 0,
    });
  }

  // Adiciona ocasionalmente um item esgotado/zerado para testar o descarte das regras de negócio
  produtos.push({
    id: `item-esgotado-${seed}`,
    titulo: `${termoLimpo} - Item Indisponível Fora de Estoque (Teste de Descarte Regex)`,
    preco_bruto: 'R$ 0,00',
    link: 'https://pt.aliexpress.com/item/000000.html',
    imagem_url: '',
    loja: 'Loja Desativada',
    avaliacao: 0,
    vendas: 0,
    frete_gratis: false,
  });

  return produtos;
}
