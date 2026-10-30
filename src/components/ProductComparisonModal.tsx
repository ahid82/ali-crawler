/**
 * Modal de Comparação Lado a Lado de Produtos Selecionados
 * Permite ao usuário comparar 2 ou mais ofertas do AliExpress detalhadamente.
 */

import React from 'react';
import {
  X,
  ExternalLink,
  CheckCircle2,
  TrendingDown,
  CloudUpload,
  Star,
  ShoppingBag,
  Truck,
  Sparkles,
} from 'lucide-react';
import { formatBRL } from '../utils/priceCleaner';

export interface ProductToCompare {
  id: string;
  titulo: string;
  preco_bruto: string;
  preco_num: number;
  preco_formatado: string;
  link: string;
  imagem_url: string;
  loja?: string;
  avaliacao?: number;
  vendas?: number;
  frete_gratis?: boolean;
}

interface ProductComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: ProductToCompare[];
  onRemoveProduct: (id: string) => void;
  onSaveToDrive?: () => void;
  isDriveAvailable?: boolean;
}

export const ProductComparisonModal: React.FC<ProductComparisonModalProps> = ({
  isOpen,
  onClose,
  products,
  onRemoveProduct,
  onSaveToDrive,
  isDriveAvailable,
}) => {
  if (!isOpen) return null;

  // Encontra o menor preço absoluto entre os selecionados
  const lowestPrice = products.length > 0
    ? Math.min(...products.map((p) => p.preco_num))
    : 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 md:p-6 overflow-y-auto">
      <div className="bg-[#2B2C30] border border-[#484B52] rounded-2xl w-full max-w-6xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden my-auto">
        {/* Header do Modal */}
        <div className="bg-[#242528] px-5 py-4 border-b border-[#484B52] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <span className="text-lg">⚖️</span>
            </div>
            <div>
              <h2 className="text-lg md:text-xl font-bold text-white flex items-center gap-2">
                <span>Comparação Lado a Lado</span>
                <span className="text-xs bg-[#36383E] text-neutral-300 px-2 py-0.5 rounded-full border border-[#484B52] font-tabular">
                  {products.length} itens selecionados
                </span>
              </h2>
              <p className="text-xs text-[#9CA3AF]">
                Análise comparativa de preços tratados, frete e reputação de vendedores.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onSaveToDrive && isDriveAvailable && (
              <button
                onClick={onSaveToDrive}
                className="hidden sm:flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
                title="Salvar comparação no Google Drive"
              >
                <CloudUpload className="w-3.5 h-3.5" />
                <span>Salvar no Drive</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="text-[#9CA3AF] hover:text-white p-1.5 rounded-lg hover:bg-[#36383E] transition-colors"
              title="Fechar comparação"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Corpo com Grid Lado a Lado */}
        <div className="p-4 md:p-6 overflow-x-auto flex-1">
          {products.length === 0 ? (
            <div className="text-center py-12 text-[#9CA3AF] space-y-2">
              <p className="text-base font-semibold text-white">Nenhum produto selecionado para comparação.</p>
              <p className="text-xs">Feche o modal e marque pelo menos 2 produtos da lista.</p>
            </div>
          ) : (
            <div
              className="grid gap-4 items-stretch"
              style={{
                gridTemplateColumns: `repeat(${Math.max(products.length, 2)}, minmax(280px, 1fr))`,
              }}
            >
              {products.map((item) => {
                const isCheapest = item.preco_num === lowestPrice;
                const diffVsLowest = item.preco_num - lowestPrice;
                const percentDiff = lowestPrice > 0 ? ((diffVsLowest / lowestPrice) * 100).toFixed(0) : '0';

                return (
                  <div
                    key={item.id}
                    className={`bg-[#36383E] border rounded-xl p-4 flex flex-col justify-between transition-all relative ${
                      isCheapest
                        ? 'border-emerald-500/80 shadow-lg shadow-emerald-500/10'
                        : 'border-[#484B52]'
                    }`}
                  >
                    {/* Botão de remover do comparador */}
                    <button
                      onClick={() => onRemoveProduct(item.id)}
                      className="absolute top-3 right-3 text-[#9CA3AF] hover:text-rose-400 p-1 rounded-full hover:bg-[#242528] transition-colors"
                      title="Remover desta comparação"
                    >
                      <X className="w-4 h-4" />
                    </button>

                    {/* Badge de Menor Preço */}
                    <div className="mb-2">
                      {isCheapest ? (
                        <div className="inline-flex items-center gap-1.5 bg-emerald-950/80 border border-emerald-500/50 text-emerald-400 text-xs font-bold px-2.5 py-1 rounded-full">
                          <TrendingDown className="w-3.5 h-3.5" />
                          <span>🏆 Melhor Custo-Benefício</span>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1 text-amber-400 text-xs font-medium bg-amber-950/40 px-2.5 py-1 rounded-full border border-amber-800/40 font-tabular">
                          <span>+{formatBRL(diffVsLowest)}</span>
                          <span className="text-[11px] text-[#9CA3AF]">({percentDiff}% mais caro)</span>
                        </div>
                      )}
                    </div>

                    {/* Imagem do Produto */}
                    <div className="w-full h-44 rounded-lg bg-[#1F2023] border border-[#484B52] overflow-hidden flex items-center justify-center mb-3">
                      {item.imagem_url ? (
                        <img
                          src={item.imagem_url}
                          alt={item.titulo}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <span className="text-xs text-[#6B7280]">Sem foto</span>
                      )}
                    </div>

                    {/* Detalhes do Produto */}
                    <div className="space-y-3 flex-1">
                      {/* Preços */}
                      <div>
                        <div className="text-2xl font-bold text-emerald-400 font-tabular">
                          {item.preco_formatado}
                        </div>
                        <div className="text-xs text-[#9CA3AF] mt-0.5">
                          Bruto extraído: <code className="text-neutral-300 font-mono">{item.preco_bruto}</code>
                        </div>
                      </div>

                      {/* Título */}
                      <h3 className="text-sm font-semibold text-white line-clamp-3 leading-snug">
                        {item.titulo}
                      </h3>

                      {/* Informações adicionais do AliExpress */}
                      <div className="bg-[#242528] rounded-lg p-2.5 space-y-1.5 text-xs border border-[#484B52]/60">
                        {item.loja && (
                          <div className="flex items-center justify-between text-[#D1D5DB]">
                            <span className="text-[#9CA3AF]">Vendedor:</span>
                            <span className="font-medium truncate max-w-[160px]">{item.loja}</span>
                          </div>
                        )}

                        {item.avaliacao && (
                          <div className="flex items-center justify-between text-[#D1D5DB]">
                            <span className="text-[#9CA3AF]">Avaliação:</span>
                            <span className="flex items-center gap-1 text-amber-400 font-semibold font-tabular">
                              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                              <span>{item.avaliacao.toFixed(1)}</span>
                            </span>
                          </div>
                        )}

                        {item.vendas !== undefined && (
                          <div className="flex items-center justify-between text-[#D1D5DB]">
                            <span className="text-[#9CA3AF]">Vendas:</span>
                            <span className="font-tabular font-medium text-white">{item.vendas.toLocaleString('pt-BR')}+ pedidos</span>
                          </div>
                        )}

                        <div className="flex items-center justify-between text-[#D1D5DB]">
                          <span className="text-[#9CA3AF]">Frete:</span>
                          <span className={item.frete_gratis ? 'text-emerald-400 font-medium' : 'text-[#D1D5DB]'}>
                            {item.frete_gratis ? 'Frete Grátis' : 'Padrão AliExpress'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Botão de Ação Direta */}
                    <div className="pt-4 mt-3 border-t border-[#484B52]/60">
                      <a
                        href={item.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full inline-flex items-center justify-center gap-1.5 bg-[#FF4747] hover:bg-[#E03E3E] text-white py-2 px-3 rounded-lg text-xs md:text-sm font-semibold transition-colors"
                      >
                        <span>Comprar no AliExpress</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Rodapé do Modal */}
        <div className="bg-[#242528] px-5 py-3 border-t border-[#484B52] flex items-center justify-between text-xs text-[#9CA3AF]">
          <span>Valores tratados pelo pipeline Regex e ordenados numericamente.</span>
          <button
            onClick={onClose}
            className="bg-[#36383E] hover:bg-[#484B52] text-white px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
