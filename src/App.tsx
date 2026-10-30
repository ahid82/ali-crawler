/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  SlidersHorizontal,
  Download,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  Code2,
  Terminal,
  FileText,
  AlertTriangle,
  Sparkles,
  ArrowUpDown,
  Filter,
  Layers,
  ChevronRight,
  TrendingDown,
  RefreshCw,
  History,
  Trash2,
  X,
  RotateCcw,
  Cloud,
  CloudUpload,
  FolderOpen,
  LogOut,
  User as UserIcon,
  Scale,
} from 'lucide-react';
import { APP_PY_CONTENT, REQUIREMENTS_TXT_CONTENT } from './data/codeSnippet';
import { cleanAliExpressPrice, formatBRL, CleaningStep } from './utils/priceCleaner';
import { gerarProdutosParaTermo, RawScrapedProduct } from './data/mockAliExpress';
import { ProductComparisonModal, ProductToCompare } from './components/ProductComparisonModal';
import {
  initAuth,
  googleSignIn,
  logout,
  getAccessToken,
} from './services/googleDriveAuth';
import {
  uploadFileToDrive,
  getOrCreateAppFolder,
  listMineradorFiles,
  deleteDriveFile,
  readJsonFromDrive,
  DriveFile,
} from './services/googleDriveService';
import type { User } from 'firebase/auth';

interface ProcessedProduct {
  id: string;
  titulo: string;
  preco_bruto: string;
  preco_num: number;
  preco_formatado: string;
  link: string;
  imagem_url: string;
  cleaningStep: CleaningStep;
  loja?: string;
  avaliacao?: number;
  vendas?: number;
  frete_gratis?: boolean;
}

export interface SearchHistoryItem {
  id: string;
  termo: string;
  data_hora: string;
  total_produtos: number;
  menor_preco: number | null;
}

const STORAGE_KEY_HISTORICO = 'minerador_aliexpress_historico_v1';

export default function App() {
  const [activeTab, setActiveTab] = useState<'console' | 'drive' | 'code' | 'requirements' | 'regex'>('console');

  // Estado de Autenticação com Google Drive
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [isLoadingDriveFiles, setIsLoadingDriveFiles] = useState<boolean>(false);
  const [driveAppFolderId, setDriveAppFolderId] = useState<string | null>(null);
  const [driveUploadStatus, setDriveUploadStatus] = useState<string | null>(null);

  // Modal de Confirmação para Ações Destrutivas (Exclusão no Drive)
  const [fileToDelete, setFileToDelete] = useState<DriveFile | null>(null);
  const [isDeletingFile, setIsDeletingFile] = useState<boolean>(false);

  // Estado do formulário de busca
  const [searchTerm, setSearchTerm] = useState('Smartwatch AMOLED');
  const [scrolls, setScrolls] = useState<number>(5);
  const [isMining, setIsMining] = useState<boolean>(false);
  const [miningStatus, setMiningStatus] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [executionTime, setExecutionTime] = useState<number | null>(null);

  // Resultados
  const [rawCount, setRawCount] = useState<number>(0);
  const [products, setProducts] = useState<ProcessedProduct[]>([]);
  const [discardedCount, setDiscardedCount] = useState<number>(0);
  const [hasSearched, setHasSearched] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  // Estados de Filtro de Faixa de Preço (pós-scraping)
  const [filterMinPrice, setFilterMinPrice] = useState<number>(0);
  const [filterMaxPrice, setFilterMaxPrice] = useState<number>(5000);
  const [isPriceFilterActive, setIsPriceFilterActive] = useState<boolean>(false);

  // Estados de Comparação Lado a Lado de Produtos
  const [selectedForComparison, setSelectedForComparison] = useState<string[]>([]);
  const [isComparisonModalOpen, setIsComparisonModalOpen] = useState<boolean>(false);

  // Histórico de Buscas
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_HISTORICO);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // ignore
    }
    return [
      {
        id: 'h-1',
        termo: 'Smartwatch AMOLED',
        data_hora: '29/10/2026 19:15',
        total_produtos: 7,
        menor_preco: 6.8,
      },
      {
        id: 'h-2',
        termo: 'Fone Bluetooth',
        data_hora: '29/10/2026 18:40',
        total_produtos: 5,
        menor_preco: 9.9,
      },
      {
        id: 'h-3',
        termo: 'Drone 4K',
        data_hora: '29/10/2026 17:22',
        total_produtos: 4,
        menor_preco: 12.5,
      },
    ];
  });

  // Salva histórico no localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_HISTORICO, JSON.stringify(searchHistory));
    } catch {
      // ignore
    }
  }, [searchHistory]);

  // Inicializa listener de autenticação
  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, token) => {
        setUser(currentUser);
        setAccessToken(token);
      },
      () => {
        // Sem autenticação ativa ou token ausente
      }
    );
    return () => unsubscribe();
  }, []);

  // Quando o usuário autentica, carrega os arquivos do Drive
  useEffect(() => {
    if (accessToken) {
      loadDriveFiles(accessToken);
    }
  }, [accessToken]);

  // Carrega lista de arquivos da pasta Minerador no Drive
  const loadDriveFiles = async (token: string) => {
    setIsLoadingDriveFiles(true);
    try {
      const folderId = await getOrCreateAppFolder(token);
      setDriveAppFolderId(folderId);
      const files = await listMineradorFiles(token, folderId);
      setDriveFiles(files);
    } catch (err) {
      console.error('Erro ao carregar arquivos do Drive:', err);
    } finally {
      setIsLoadingDriveFiles(false);
    }
  };

  // Login com Google
  const handleGoogleSignIn = async () => {
    setIsLoggingIn(true);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setAccessToken(result.accessToken);
        loadDriveFiles(result.accessToken);
      }
    } catch (err: any) {
      console.error('Falha no login Google:', err);
      alert('Não foi possível autenticar com o Google Drive: ' + (err.message || 'Erro desconhecido'));
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Logout
  const handleLogout = async () => {
    await logout();
    setUser(null);
    setAccessToken(null);
    setDriveFiles([]);
  };

  // Upload dos resultados atuais para o Google Drive
  const handleSaveReportToDrive = async () => {
    if (!accessToken) {
      // Se não autenticado, solicita login primeiro
      await handleGoogleSignIn();
      return;
    }

    if (filteredProducts.length === 0) {
      alert('Não há produtos para exportar no momento.');
      return;
    }

    setDriveUploadStatus('Preparando e enviando relatório para o Google Drive...');
    try {
      const folderId = driveAppFolderId || (await getOrCreateAppFolder(accessToken));
      const headers = ['Título', 'Preço Numérico (BRL)', 'Preço Formatado', 'Preço Bruto Extraído', 'Link do Produto'];
      const rows = filteredProducts.map((p) => [
        `"${p.titulo.replace(/"/g, '""')}"`,
        p.preco_num,
        `"${p.preco_formatado}"`,
        `"${p.preco_bruto}"`,
        `"${p.link}"`,
      ]);
      const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
      const fileName = `aliexpress_${searchTerm.replace(/\s+/g, '_').toLowerCase()}_${new Date()
        .toISOString()
        .slice(0, 10)}.csv`;

      const uploaded = await uploadFileToDrive(accessToken, fileName, csvContent, 'text/csv', folderId);
      setDriveUploadStatus(`Relatório '${uploaded.name}' salvo com sucesso no Google Drive!`);
      loadDriveFiles(accessToken);

      setTimeout(() => {
        setDriveUploadStatus(null);
      }, 5000);
    } catch (err: any) {
      console.error('Erro no upload para o Drive:', err);
      setDriveUploadStatus(`Erro ao salvar no Drive: ${err.message || 'Falha desconhecida'}`);
    }
  };

  // Backup do histórico no Google Drive
  const handleBackupHistoryToDrive = async () => {
    if (!accessToken) {
      await handleGoogleSignIn();
      return;
    }

    setDriveUploadStatus('Fazendo backup do histórico no Google Drive...');
    try {
      const folderId = driveAppFolderId || (await getOrCreateAppFolder(accessToken));
      const jsonContent = JSON.stringify(searchHistory, null, 2);
      const fileName = `historico_buscas_${new Date().toISOString().slice(0, 10)}.json`;

      await uploadFileToDrive(accessToken, fileName, jsonContent, 'application/json', folderId);
      setDriveUploadStatus(`Backup do histórico salvo no Google Drive!`);
      loadDriveFiles(accessToken);

      setTimeout(() => {
        setDriveUploadStatus(null);
      }, 4000);
    } catch (err: any) {
      setDriveUploadStatus(`Erro no backup: ${err.message}`);
    }
  };

  // Confirmação explícita de exclusão no Drive (MANDATÓRIO para ações destrutivas)
  const handleConfirmDeleteDriveFile = async () => {
    if (!accessToken || !fileToDelete) return;

    setIsDeletingFile(true);
    try {
      await deleteDriveFile(accessToken, fileToDelete.id);
      setDriveFiles((prev) => prev.filter((f) => f.id !== fileToDelete.id));
      setFileToDelete(null);
    } catch (err: any) {
      alert(`Erro ao excluir arquivo: ${err.message}`);
    } finally {
      setIsDeletingFile(false);
    }
  };

  // Regex Sandbox State
  const [testString, setTestString] = useState('R$ 1.450,99 + impostos');
  const testResult = useMemo(() => cleanAliExpressPrice(testString), [testString]);

  // Copied toast state
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedReqs, setCopiedReqs] = useState(false);

  // Limites absolutos dos produtos minerados atualmente
  const currentMinAbsolute = useMemo(() => {
    if (products.length === 0) return 0;
    return Math.floor(products[0].preco_num);
  }, [products]);

  const currentMaxAbsolute = useMemo(() => {
    if (products.length === 0) return 1000;
    return Math.ceil(products[products.length - 1].preco_num);
  }, [products]);

  // Produtos Filtrados pela Faixa de Preço (pós-limpeza)
  const filteredProducts = useMemo(() => {
    if (!isPriceFilterActive || products.length === 0) {
      return products;
    }
    return products.filter((p) => p.preco_num >= filterMinPrice && p.preco_num <= filterMaxPrice);
  }, [products, filterMinPrice, filterMaxPrice, isPriceFilterActive]);

  // Execução do pipeline de mineração
  const handleStartMining = (termoOverride?: string) => {
    const termo = (termoOverride !== undefined ? termoOverride : searchTerm).trim();
    if (!termo) return;

    if (termoOverride) {
      setSearchTerm(termoOverride);
    }

    setIsMining(true);
    setProgressPercent(10);
    setMiningStatus('Iniciando navegador com Playwright & Stealth Shield...');
    setProducts([]);
    setSelectedForComparison([]);
    setHasSearched(true);
    setIsPriceFilterActive(false);

    const startTime = performance.now();

    setTimeout(() => {
      setProgressPercent(25);
      setMiningStatus(`Navegando para: https://pt.aliexpress.com/wholesale?SearchText=${encodeURIComponent(termo)}`);

      setTimeout(() => {
        setProgressPercent(45);
        setMiningStatus(`Rolando a página (1000px) [Passo 1/${scrolls}] com pausas aleatórias...`);

        setTimeout(() => {
          setProgressPercent(65);
          setMiningStatus(`Rolando a página (${scrolls * 1000}px) [Passo ${scrolls}/${scrolls}] para carregar lazy-loading...`);

          setTimeout(() => {
            setProgressPercent(80);
            setMiningStatus('Extraindo nós do DOM (título, preço bruto, imagem, link)...');

            setTimeout(() => {
              setProgressPercent(92);
              setMiningStatus('Limpando dados monetários via Regex e Pandas...');

              const rawData = gerarProdutosParaTermo(termo, scrolls);
              setRawCount(rawData.length);

              const processedList: ProcessedProduct[] = [];
              let discarded = 0;

              for (const item of rawData) {
                const step = cleanAliExpressPrice(item.preco_bruto);
                if (step.isValid && step.numericValue !== null && step.numericValue > 0) {
                  processedList.push({
                    id: item.id,
                    titulo: item.titulo,
                    preco_bruto: item.preco_bruto,
                    preco_num: step.numericValue,
                    preco_formatado: step.formattedBRL || formatBRL(step.numericValue),
                    link: item.link,
                    imagem_url: item.imagem_url,
                    cleaningStep: step,
                    loja: item.loja,
                    avaliacao: item.avaliacao,
                    vendas: item.vendas,
                    frete_gratis: item.frete_gratis,
                  });
                } else {
                  discarded++;
                }
              }

              processedList.sort((a, b) => a.preco_num - b.preco_num);

              setProducts(processedList);
              setDiscardedCount(discarded);

              if (processedList.length > 0) {
                const minVal = Math.floor(processedList[0].preco_num);
                const maxVal = Math.ceil(processedList[processedList.length - 1].preco_num);
                setFilterMinPrice(minVal);
                setFilterMaxPrice(maxVal > minVal ? maxVal : minVal + 10);
              }

              setProgressPercent(100);
              const endTime = performance.now();
              const duracao = parseFloat(((endTime - startTime) / 1000).toFixed(2));
              setExecutionTime(duracao);

              const menor = processedList.length > 0 ? processedList[0].preco_num : null;
              const novoHistorico: SearchHistoryItem = {
                id: `hist-${Date.now()}`,
                termo,
                data_hora: new Date().toLocaleString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                }),
                total_produtos: processedList.length,
                menor_preco: menor,
              };

              setSearchHistory((prev) => {
                const filtrado = prev.filter((h) => h.termo.toLowerCase() !== termo.toLowerCase());
                return [novoHistorico, ...filtrado].slice(0, 30);
              });

              setTimeout(() => {
                setIsMining(false);
                setMiningStatus('');
              }, 400);
            }, 500);
          }, 600);
        }, 550);
      }, 500);
    }, 450);
  };

  const handleDownloadPy = () => {
    const blob = new Blob([APP_PY_CONTENT], { type: 'text/x-python;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'app.py';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadReqs = () => {
    const blob = new Blob([REQUIREMENTS_TXT_CONTENT], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'requirements.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadCSV = () => {
    if (filteredProducts.length === 0) return;
    const headers = ['Título', 'Preço Numérico (BRL)', 'Preço Formatado', 'Preço Bruto Extraído', 'Link do Produto'];
    const rows = filteredProducts.map((p) => [
      `"${p.titulo.replace(/"/g, '""')}"`,
      p.preco_num,
      `"${p.preco_formatado}"`,
      `"${p.preco_bruto}"`,
      `"${p.link}"`,
    ]);
    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aliexpress_${searchTerm.replace(/\s+/g, '_').toLowerCase()}_filtrado.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadHistoryJSON = () => {
    const jsonStr = JSON.stringify(searchHistory, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'historico_buscas.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClearHistory = () => {
    setSearchHistory([]);
  };

  const handleDeleteHistoryItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSearchHistory((prev) => prev.filter((item) => item.id !== id));
  };

  const handleCopyCode = (text: string, type: 'code' | 'reqs') => {
    navigator.clipboard.writeText(text);
    if (type === 'code') {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } else {
      setCopiedReqs(true);
      setTimeout(() => setCopiedReqs(false), 2000);
    }
  };

  // Funções de Seleção e Comparação
  const toggleSelectProduct = (id: string) => {
    setSelectedForComparison((prev) =>
      prev.includes(id) ? prev.filter((pId) => pId !== id) : [...prev, id]
    );
  };

  const handleRemoveFromComparison = (id: string) => {
    setSelectedForComparison((prev) => prev.filter((pId) => pId !== id));
  };

  const productsToCompare = useMemo<ProductToCompare[]>(() => {
    return products
      .filter((p) => selectedForComparison.includes(p.id))
      .map((p) => ({
        id: p.id,
        titulo: p.titulo,
        preco_bruto: p.preco_bruto,
        preco_num: p.preco_num,
        preco_formatado: p.preco_formatado,
        link: p.link,
        imagem_url: p.imagem_url,
        loja: p.loja,
        avaliacao: p.avaliacao,
        vendas: p.vendas,
        frete_gratis: p.frete_gratis,
      }));
  }, [products, selectedForComparison]);

  const handleSaveComparisonToDrive = async () => {
    if (!accessToken) {
      await handleGoogleSignIn();
      return;
    }
    if (productsToCompare.length === 0) return;

    setDriveUploadStatus('Salvando relatório de comparação no Google Drive...');
    try {
      const folderId = driveAppFolderId || (await getOrCreateAppFolder(accessToken));
      const headers = ['Título', 'Preço Numérico (BRL)', 'Preço Formatado', 'Preço Bruto', 'Vendedor', 'Link'];
      const rows = productsToCompare.map((p) => [
        `"${p.titulo.replace(/"/g, '""')}"`,
        p.preco_num,
        `"${p.preco_formatado}"`,
        `"${p.preco_bruto}"`,
        `"${p.loja || ''}"`,
        `"${p.link}"`,
      ]);
      const csv = '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
      const fileName = `comparativo_produtos_${new Date().toISOString().slice(0, 10)}.csv`;
      await uploadFileToDrive(accessToken, fileName, csv, 'text/csv', folderId);
      setDriveUploadStatus('Relatório de comparação salvo no Google Drive!');
      loadDriveFiles(accessToken);
      setTimeout(() => setDriveUploadStatus(null), 4000);
    } catch (err: any) {
      setDriveUploadStatus(`Erro ao salvar no Drive: ${err.message}`);
    }
  };

  const lowestPrice = filteredProducts.length > 0 ? filteredProducts[0].preco_num : null;
  const averagePrice =
    filteredProducts.length > 0
      ? filteredProducts.reduce((acc, curr) => acc + curr.preco_num, 0) / filteredProducts.length
      : null;

  return (
    <div className="min-h-screen bg-[#2B2C30] text-[#F5F6F8] flex flex-col selection:bg-[#FF4747] selection:text-white">
      {/* TOP BAR CONTRACT: Brand zone - Nav links - 1 Primary Action */}
      <header className="border-b border-[#484B52] bg-[#242528] px-4 md:px-8 py-3.5 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 md:gap-8">
          {/* Brand Zone */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#FF4747] to-[#B91C1C] flex items-center justify-center shadow-md">
              <span className="text-lg">⛏️</span>
            </div>
            <div className="whitespace-nowrap">
              <span className="text-lg md:text-xl font-bold tracking-tight text-white">Minerador AliExpress</span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="hidden sm:flex items-center gap-1 md:gap-2">
            <button
              onClick={() => setActiveTab('console')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'console'
                  ? 'bg-[#36383E] text-white shadow-sm'
                  : 'text-[#9CA3AF] hover:text-white hover:bg-[#36383E]/50'
              }`}
            >
              Console Minerador
            </button>
            <button
              onClick={() => setActiveTab('drive')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                activeTab === 'drive'
                  ? 'bg-[#36383E] text-white shadow-sm'
                  : 'text-[#9CA3AF] hover:text-white hover:bg-[#36383E]/50'
              }`}
            >
              <Cloud className="w-4 h-4 text-blue-400" />
              <span>Google Drive</span>
              {user && <span className="w-2 h-2 rounded-full bg-emerald-400" />}
            </button>
            <button
              onClick={() => setActiveTab('code')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'code'
                  ? 'bg-[#36383E] text-white shadow-sm'
                  : 'text-[#9CA3AF] hover:text-white hover:bg-[#36383E]/50'
              }`}
            >
              Código app.py
            </button>
            <button
              onClick={() => setActiveTab('requirements')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'requirements'
                  ? 'bg-[#36383E] text-white shadow-sm'
                  : 'text-[#9CA3AF] hover:text-white hover:bg-[#36383E]/50'
              }`}
            >
              requirements.txt
            </button>
            <button
              onClick={() => setActiveTab('regex')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'regex'
                  ? 'bg-[#36383E] text-white shadow-sm'
                  : 'text-[#9CA3AF] hover:text-white hover:bg-[#36383E]/50'
              }`}
            >
              Laboratório Regex
            </button>
          </nav>

          {/* Primary Action / Google Account Zone */}
          <div className="flex items-center gap-2.5 shrink-0">
            {user ? (
              <div className="flex items-center gap-2 bg-[#1F2023] border border-[#484B52] rounded-lg px-2.5 py-1.5 text-xs text-white">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'Usuário'}
                    className="w-5 h-5 rounded-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <UserIcon className="w-4 h-4 text-[#9CA3AF]" />
                )}
                <span className="hidden md:inline font-medium max-w-[120px] truncate">{user.displayName || user.email}</span>
                <button
                  onClick={handleLogout}
                  className="text-[#9CA3AF] hover:text-rose-400 ml-1 transition-colors"
                  title="Desconectar do Google Drive"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={handleGoogleSignIn}
                disabled={isLoggingIn}
                className="flex items-center gap-2 bg-[#1F2023] hover:bg-[#2B2C30] border border-[#484B52] text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-all shadow-sm"
                title="Conectar com o Google Drive"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>{isLoggingIn ? 'Conectando...' : 'Google Drive'}</span>
              </button>
            )}

            <button
              onClick={handleDownloadPy}
              className="flex items-center gap-1.5 bg-[#FF4747] hover:bg-[#E03E3E] text-white px-3 py-1.5 rounded-lg text-xs md:text-sm font-semibold transition-all shadow-sm active:scale-95 whitespace-nowrap shrink-0"
              title="Baixar arquivo app.py pronto para execução"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Baixar app.py</span>
            </button>
          </div>
        </div>

        {/* Mobile Navigation Bar */}
        <div className="sm:hidden flex items-center justify-between gap-1 pt-2.5 mt-2 border-t border-[#36383E] overflow-x-auto">
          <button
            onClick={() => setActiveTab('console')}
            className={`px-2.5 py-1 text-xs font-medium rounded ${
              activeTab === 'console' ? 'bg-[#36383E] text-white' : 'text-[#9CA3AF]'
            }`}
          >
            Console
          </button>
          <button
            onClick={() => setActiveTab('drive')}
            className={`px-2.5 py-1 text-xs font-medium rounded flex items-center gap-1 ${
              activeTab === 'drive' ? 'bg-[#36383E] text-white' : 'text-[#9CA3AF]'
            }`}
          >
            <Cloud className="w-3 h-3 text-blue-400" />
            <span>Drive</span>
          </button>
          <button
            onClick={() => setActiveTab('code')}
            className={`px-2.5 py-1 text-xs font-medium rounded ${
              activeTab === 'code' ? 'bg-[#36383E] text-white' : 'text-[#9CA3AF]'
            }`}
          >
            app.py
          </button>
          <button
            onClick={() => setActiveTab('requirements')}
            className={`px-2.5 py-1 text-xs font-medium rounded ${
              activeTab === 'requirements' ? 'bg-[#36383E] text-white' : 'text-[#9CA3AF]'
            }`}
          >
            requirements
          </button>
          <button
            onClick={() => setActiveTab('regex')}
            className={`px-2.5 py-1 text-xs font-medium rounded ${
              activeTab === 'regex' ? 'bg-[#36383E] text-white' : 'text-[#9CA3AF]'
            }`}
          >
            Regex Lab
          </button>
        </div>
      </header>

      {/* FEEDBACK BANNER DE UPLOAD GOOGLE DRIVE */}
      {driveUploadStatus && (
        <div className="bg-blue-950/80 border-b border-blue-500/40 text-blue-200 text-xs md:text-sm py-2 px-4 text-center flex items-center justify-center gap-2">
          <Cloud className="w-4 h-4 text-blue-400 shrink-0" />
          <span>{driveUploadStatus}</span>
          <button onClick={() => setDriveUploadStatus(null)} className="ml-2 text-blue-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* MAIN CONTAINER */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-8">
        {/* ========================================================================= */}
        {/* TAB 1: CONSOLE MINERADOR (STREAMLIT SIMULATOR) */}
        {/* ========================================================================= */}
        {activeTab === 'console' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* COLUNA ESQUERDA: HISTÓRICO DE BUSCAS LOCAL (PERSISTÊNCIA JSON) */}
            <div className="lg:col-span-3 order-2 lg:order-1 bg-[#36383E] border border-[#484B52] rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-[#484B52]/70 pb-2.5">
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4 text-[#FF4747]" />
                  <span className="font-bold text-sm text-white">Histórico de Buscas</span>
                </div>
                {searchHistory.length > 0 && (
                  <button
                    onClick={handleClearHistory}
                    className="text-[11px] text-[#9CA3AF] hover:text-rose-400 flex items-center gap-1 transition-colors"
                    title="Limpar histórico"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Limpar</span>
                  </button>
                )}
              </div>

              <p className="text-[11px] text-[#9CA3AF] leading-snug">
                Termos gravados em <code className="text-neutral-300">historico_buscas.json</code>. Clique para
                reexecutar a busca:
              </p>

              {searchHistory.length === 0 ? (
                <div className="text-center py-6 text-xs text-[#9CA3AF]">Nenhuma busca salva no histórico.</div>
              ) : (
                <div className="space-y-1.5 max-h-[360px] overflow-y-auto pr-1">
                  {searchHistory.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => handleStartMining(item.termo)}
                      className={`p-2.5 rounded-lg border text-left cursor-pointer transition-all group relative ${
                        searchTerm.toLowerCase() === item.termo.toLowerCase()
                          ? 'bg-[#1F2023] border-[#FF4747]'
                          : 'bg-[#2B2C30] border-[#484B52]/60 hover:border-[#FF4747]/70 hover:bg-[#242528]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-xs md:text-sm text-white truncate max-w-[170px]">
                          {item.termo}
                        </span>
                        <button
                          onClick={(e) => handleDeleteHistoryItem(item.id, e)}
                          className="opacity-0 group-hover:opacity-100 text-[#9CA3AF] hover:text-rose-400 p-0.5 rounded transition-opacity"
                          title="Remover termo"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-[#9CA3AF] mt-1 font-tabular">
                        <span>{item.data_hora}</span>
                        {item.menor_preco !== null && (
                          <span className="text-emerald-400 font-semibold">{formatBRL(item.menor_preco)}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Ações de Histórico + Google Drive Backup */}
              <div className="pt-2 border-t border-[#484B52]/60 space-y-1.5">
                <button
                  onClick={handleBackupHistoryToDrive}
                  className="w-full text-xs text-blue-300 hover:text-white bg-blue-950/40 hover:bg-blue-900/60 border border-blue-800/60 py-1.5 px-2 rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                >
                  <CloudUpload className="w-3.5 h-3.5" />
                  <span>Salvar Backup no Google Drive</span>
                </button>

                <button
                  onClick={handleDownloadHistoryJSON}
                  className="w-full text-xs text-[#D1D5DB] hover:text-white bg-[#242528] hover:bg-[#1F2023] border border-[#484B52] py-1.5 px-2 rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Baixar historico_buscas.json</span>
                </button>
              </div>
            </div>

            {/* COLUNA DIREITA: CONSOLE PRINCIPAL COM BUSCA, FILTRO E RESULTADOS */}
            <div className="lg:col-span-9 order-1 lg:order-2 space-y-6">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white mb-1">
                  Minerador de Ofertas AliExpress
                </h1>
                <p className="text-sm md:text-base text-[#9CA3AF]">
                  Scraping com <span className="text-[#F3F4F6] font-medium">Playwright + Stealth Shield</span>, filtro de
                  preço dinâmico, exportação para <span className="text-blue-400 font-medium">Google Drive</span> e ordenação
                  pelo menor preço.
                </p>
              </div>

              {/* FORMULÁRIO DE BUSCA - Fontes ampliadas para uso mobile */}
              <div className="bg-[#36383E] border border-[#484B52] rounded-xl p-4 md:p-6 shadow-md">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                  {/* Termo de Busca (Input ampliado) */}
                  <div className="md:col-span-7">
                    <label className="block text-sm md:text-base font-semibold text-white mb-2">Termo de Busca:</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleStartMining()}
                        placeholder="Ex: Smartwatch AMOLED, Drone 4K, Fone Bluetooth..."
                        className="w-full bg-[#1F2023] border border-[#484B52] focus:border-[#FF4747] focus:ring-2 focus:ring-[#FF4747]/30 text-white text-base md:text-lg px-4 py-3 rounded-lg outline-none transition-all placeholder:text-[#6B7280]"
                      />
                      <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-[#9CA3AF]" />
                    </div>
                  </div>

                  {/* Rolagens (Lazy-load) */}
                  <div className="md:col-span-2">
                    <label className="block text-sm md:text-base font-semibold text-white mb-2">Rolagens (1000px):</label>
                    <select
                      value={scrolls}
                      onChange={(e) => setScrolls(Number(e.target.value))}
                      className="w-full bg-[#1F2023] border border-[#484B52] focus:border-[#FF4747] text-white text-base md:text-lg px-3 py-3 rounded-lg outline-none"
                    >
                      <option value={5}>5 rolagens</option>
                      <option value={7}>7 rolagens</option>
                      <option value={10}>10 rolagens</option>
                      <option value={15}>15 rolagens</option>
                    </select>
                  </div>

                  {/* Botão de Mineração */}
                  <div className="md:col-span-3">
                    <button
                      onClick={() => handleStartMining()}
                      disabled={isMining || !searchTerm.trim()}
                      className="w-full bg-gradient-to-r from-[#FF4747] to-[#D82C2C] hover:from-[#FF5C5C] hover:to-[#E53838] disabled:opacity-50 text-white font-semibold text-base md:text-lg py-3 px-6 rounded-lg transition-all shadow-lg shadow-[#FF4747]/20 flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                    >
                      {isMining ? (
                        <>
                          <RefreshCw className="w-5 h-5 animate-spin" />
                          <span>Minerando...</span>
                        </>
                      ) : (
                        <>
                          <Search className="w-5 h-5" />
                          <span>Minerar Ofertas</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Sugestões rápidas de busca */}
                <div className="mt-4 pt-3 border-t border-[#484B52]/60 flex flex-wrap items-center gap-2 text-xs md:text-sm">
                  <span className="text-[#9CA3AF]">Sugestões:</span>
                  {['Smartwatch AMOLED', 'Fone Bluetooth', 'Drone 4K', 'SSD NVMe 1TB'].map((sug) => (
                    <button
                      key={sug}
                      onClick={() => {
                        setSearchTerm(sug);
                        handleStartMining(sug);
                      }}
                      className="bg-[#242528] hover:bg-[#484B52] text-[#D1D5DB] px-2.5 py-1 rounded text-xs transition-colors"
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              </div>

              {/* STATUS SPINNER DINÂMICO (st.spinner do Streamlit) */}
              {isMining && (
                <div className="bg-[#1F2023] border border-[#FF4747]/40 rounded-xl p-5 shadow-lg space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 border-3 border-[#FF4747] border-t-transparent rounded-full animate-spin shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-base md:text-lg font-semibold text-white truncate">{miningStatus}</p>
                      <p className="text-xs text-[#9CA3AF]">
                        Executando pipeline dinâmico de web scraping com Playwright-stealth
                      </p>
                    </div>
                    <span className="font-mono text-sm text-[#FF4747] font-semibold">{progressPercent}%</span>
                  </div>
                  <div className="w-full bg-[#36383E] rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-[#FF4747] h-full transition-all duration-300 ease-out"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              )}

              {/* SEÇÃO DE RESULTADOS & FILTROS */}
              {hasSearched && !isMining && (
                <div className="space-y-6">
                  {products.length === 0 ? (
                    <div className="bg-[#36383E] border border-[#484B52] rounded-xl p-8 text-center">
                      <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-3" />
                      <h3 className="text-lg font-bold text-white mb-1">Nenhum produto com preço válido encontrado</h3>
                      <p className="text-[#9CA3AF] max-w-md mx-auto text-sm">
                        A busca não retornou valores numéricos válidos. Tente aumentar o número de rolagens ou pesquisar por
                        outro termo.
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* =================================================================== */}
                      {/* FILTROS DE FAIXA DE PREÇO (APLICADOS PÓS-SCRAPING E PÓS-LIMPEZA) */}
                      {/* =================================================================== */}
                      <div className="bg-[#36383E] border border-[#484B52] rounded-xl p-4 md:p-5 shadow-md space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#484B52]/60 pb-3">
                          <div className="flex items-center gap-2">
                            <Filter className="w-5 h-5 text-[#FF4747]" />
                            <h2 className="text-base md:text-lg font-bold text-white">
                              Filtrar por Faixa de Preço (Pós-Limpeza)
                            </h2>
                          </div>

                          <div className="flex items-center gap-2">
                            {isPriceFilterActive && (
                              <button
                                onClick={() => {
                                  setFilterMinPrice(currentMinAbsolute);
                                  setFilterMaxPrice(currentMaxAbsolute);
                                  setIsPriceFilterActive(false);
                                }}
                                className="text-xs text-[#9CA3AF] hover:text-white flex items-center gap-1 bg-[#242528] px-2.5 py-1 rounded transition-colors"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>Redefinir Filtro</span>
                              </button>
                            )}
                            <span className="text-xs font-semibold text-emerald-400 bg-emerald-950/60 border border-emerald-800/80 px-2.5 py-1 rounded-full font-tabular">
                              {filteredProducts.length} de {products.length} produtos
                            </span>
                          </div>
                        </div>

                        {/* Slider e Entradas Numéricas */}
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                          <div className="md:col-span-6 space-y-2">
                            <div className="flex justify-between text-xs text-[#9CA3AF]">
                              <span>Min: {formatBRL(filterMinPrice)}</span>
                              <span>Max: {formatBRL(filterMaxPrice)}</span>
                            </div>
                            <input
                              type="range"
                              min={currentMinAbsolute}
                              max={currentMaxAbsolute > currentMinAbsolute ? currentMaxAbsolute : currentMinAbsolute + 10}
                              value={filterMaxPrice}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                setFilterMaxPrice(val);
                                setIsPriceFilterActive(true);
                              }}
                              className="w-full accent-[#FF4747] cursor-pointer"
                            />
                            <div className="flex justify-between text-[11px] text-[#9CA3AF]">
                              <span>Absoluto: {formatBRL(currentMinAbsolute)}</span>
                              <span>Teto: {formatBRL(currentMaxAbsolute)}</span>
                            </div>
                          </div>

                          <div className="md:col-span-3">
                            <label className="block text-xs font-semibold text-[#D1D5DB] mb-1">Preço Mínimo (R$):</label>
                            <input
                              type="number"
                              min={0}
                              max={filterMaxPrice}
                              value={filterMinPrice}
                              onChange={(e) => {
                                setFilterMinPrice(Math.max(0, Number(e.target.value)));
                                setIsPriceFilterActive(true);
                              }}
                              className="w-full bg-[#1F2023] border border-[#484B52] focus:border-[#FF4747] text-white text-base px-3 py-2 rounded-lg font-tabular outline-none"
                            />
                          </div>

                          <div className="md:col-span-3">
                            <label className="block text-xs font-semibold text-[#D1D5DB] mb-1">Preço Máximo (R$):</label>
                            <input
                              type="number"
                              min={filterMinPrice}
                              value={filterMaxPrice}
                              onChange={(e) => {
                                setFilterMaxPrice(Math.max(filterMinPrice, Number(e.target.value)));
                                setIsPriceFilterActive(true);
                              }}
                              className="w-full bg-[#1F2023] border border-[#484B52] focus:border-[#FF4747] text-white text-base px-3 py-2 rounded-lg font-tabular outline-none"
                            />
                          </div>
                        </div>

                        {/* Atalhos rápidos de faixa de preço */}
                        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-[#484B52]/40 text-xs">
                          <span className="text-[#9CA3AF]">Faixas rápidas:</span>
                          {[
                            { label: 'Todos', min: currentMinAbsolute, max: currentMaxAbsolute, active: false },
                            { label: 'Até R$ 50', min: 0, max: 50, active: true },
                            { label: 'R$ 50 a R$ 200', min: 50, max: 200, active: true },
                            { label: 'R$ 200 a R$ 600', min: 200, max: 600, active: true },
                            { label: 'Acima de R$ 600', min: 600, max: Math.max(2000, currentMaxAbsolute), active: true },
                          ].map((preset) => (
                            <button
                              key={preset.label}
                              onClick={() => {
                                setFilterMinPrice(preset.min);
                                setFilterMaxPrice(preset.max);
                                setIsPriceFilterActive(preset.active);
                              }}
                              className="bg-[#242528] hover:bg-[#484B52] text-[#D1D5DB] hover:text-white px-2.5 py-1 rounded text-xs transition-colors"
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* KPI CARDS (Métricas da Faixa Filtrada) */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                        <div className="bg-[#36383E] border border-[#484B52] rounded-xl p-4">
                          <div className="flex items-center justify-between text-xs md:text-sm text-[#9CA3AF] mb-1">
                            <span>Menor Preço (Faixa)</span>
                            <TrendingDown className="w-4 h-4 text-emerald-400" />
                          </div>
                          <div className="text-xl md:text-2xl font-bold text-emerald-400 font-tabular">
                            {lowestPrice !== null ? formatBRL(lowestPrice) : '-'}
                          </div>
                          <div className="text-[11px] text-[#9CA3AF] mt-0.5">Top 1 da ordenação</div>
                        </div>

                        <div className="bg-[#36383E] border border-[#484B52] rounded-xl p-4">
                          <div className="flex items-center justify-between text-xs md:text-sm text-[#9CA3AF] mb-1">
                            <span>Preço Médio (Faixa)</span>
                            <ArrowUpDown className="w-4 h-4 text-blue-400" />
                          </div>
                          <div className="text-xl md:text-2xl font-bold text-white font-tabular">
                            {averagePrice !== null ? formatBRL(averagePrice) : '-'}
                          </div>
                          <div className="text-[11px] text-[#9CA3AF] mt-0.5">Média dos itens filtrados</div>
                        </div>

                        <div className="bg-[#36383E] border border-[#484B52] rounded-xl p-4">
                          <div className="flex items-center justify-between text-xs md:text-sm text-[#9CA3AF] mb-1">
                            <span>Itens na Faixa</span>
                            <ShieldCheck className="w-4 h-4 text-indigo-400" />
                          </div>
                          <div className="text-xl md:text-2xl font-bold text-white font-tabular">
                            {filteredProducts.length}{' '}
                            <span className="text-xs text-[#9CA3AF] font-normal">/ {products.length} válidos</span>
                          </div>
                          <div className="text-[11px] text-[#9CA3AF] mt-0.5">
                            {discardedCount} descartados por preço 0/NA
                          </div>
                        </div>

                        <div className="bg-[#36383E] border border-[#484B52] rounded-xl p-4">
                          <div className="flex items-center justify-between text-xs md:text-sm text-[#9CA3AF] mb-1">
                            <span>Tempo Total</span>
                            <Sparkles className="w-4 h-4 text-amber-400" />
                          </div>
                          <div className="text-xl md:text-2xl font-bold text-amber-400 font-tabular">
                            {executionTime}s
                          </div>
                          <div className="text-[11px] text-[#9CA3AF] mt-0.5">Scraping + regex + pandas</div>
                        </div>
                      </div>

                      {/* BARRA DE CONTROLE: Modo de Exibição, Download e Google Drive */}
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-[#242528] p-3 rounded-xl border border-[#484B52]">
                        <div className="flex items-center gap-2">
                          <span className="text-xs md:text-sm font-semibold text-[#9CA3AF]">Visualização:</span>
                          <div className="inline-flex bg-[#1F2023] rounded-lg p-1 border border-[#484B52]">
                            <button
                              onClick={() => setViewMode('cards')}
                              className={`px-3 py-1 text-xs md:text-sm font-medium rounded-md transition-colors ${
                                viewMode === 'cards' ? 'bg-[#36383E] text-white' : 'text-[#9CA3AF] hover:text-white'
                              }`}
                            >
                              Cards com Foto
                            </button>
                            <button
                              onClick={() => setViewMode('table')}
                              className={`px-3 py-1 text-xs md:text-sm font-medium rounded-md transition-colors ${
                                viewMode === 'table' ? 'bg-[#36383E] text-white' : 'text-[#9CA3AF] hover:text-white'
                              }`}
                            >
                              Tabela DataFrame
                            </button>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                          {/* Botão de Comparação Lado a Lado */}
                          <button
                            onClick={() => {
                              if (selectedForComparison.length < 2) {
                                alert('Selecione pelo menos 2 produtos marcando a caixa "Comparar" nos cards para comparar lado a lado.');
                                return;
                              }
                              setIsComparisonModalOpen(true);
                            }}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs md:text-sm font-semibold transition-all shadow-sm ${
                              selectedForComparison.length >= 2
                                ? 'bg-emerald-600 hover:bg-emerald-500 text-white animate-pulse'
                                : selectedForComparison.length === 1
                                ? 'bg-[#36383E] text-emerald-400 border border-emerald-500/50'
                                : 'bg-[#36383E] text-[#9CA3AF] border border-[#484B52]'
                            }`}
                            title="Selecione 2 ou mais produtos para ver a comparação detalhada"
                          >
                            <Scale className="w-4 h-4" />
                            <span>
                              Comparar {selectedForComparison.length > 0 ? `(${selectedForComparison.length})` : ''}
                            </span>
                          </button>

                          {/* Salvar no Google Drive */}
                          <button
                            onClick={handleSaveReportToDrive}
                            disabled={filteredProducts.length === 0}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg text-xs md:text-sm font-medium transition-colors shadow-sm"
                            title="Salvar relatório diretamente na pasta 'Minerador AliExpress' do seu Google Drive"
                          >
                            <CloudUpload className="w-4 h-4" />
                            <span>Salvar no Google Drive</span>
                          </button>

                          {/* Baixar CSV Local */}
                          <button
                            onClick={handleDownloadCSV}
                            disabled={filteredProducts.length === 0}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-[#36383E] hover:bg-[#484B52] disabled:opacity-40 text-white px-3 py-1.5 rounded-lg text-xs md:text-sm font-medium border border-[#484B52] transition-colors"
                          >
                            <Download className="w-4 h-4" />
                            <span>Baixar CSV</span>
                          </button>
                        </div>
                      </div>

                      {/* MODO CARDS COM MINIATURA */}
                      {filteredProducts.length === 0 ? (
                        <div className="bg-[#36383E] border border-[#484B52] rounded-xl p-8 text-center">
                          <p className="text-white font-semibold">Nenhum produto dentro da faixa de preço selecionada.</p>
                          <p className="text-sm text-[#9CA3AF] mt-1">
                            Ajuste os controles deslizantes ou redefina o filtro acima.
                          </p>
                        </div>
                      ) : viewMode === 'cards' ? (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between text-sm font-semibold text-[#9CA3AF]">
                            <div className="flex items-center gap-2">
                              <TrendingDown className="w-4 h-4 text-emerald-400" />
                              <span>
                                Ordenado por Menor Preço — {filteredProducts.length} itens (marque para comparar)
                              </span>
                            </div>
                            {selectedForComparison.length > 0 && (
                              <button
                                onClick={() => setSelectedForComparison([])}
                                className="text-xs text-rose-400 hover:underline"
                              >
                                Limpar seleção ({selectedForComparison.length})
                              </button>
                            )}
                          </div>

                          {filteredProducts.map((item, index) => {
                            const isSelected = selectedForComparison.includes(item.id);

                            return (
                              <div
                                key={item.id}
                                className={`rounded-xl p-3.5 md:p-4.5 transition-all flex flex-col sm:flex-row items-start sm:items-center gap-4 group ${
                                  isSelected
                                    ? 'bg-[#3A3D44] border-2 border-[#FF4747] shadow-lg shadow-[#FF4747]/10'
                                    : 'bg-[#36383E] hover:border-[#FF4747] border border-[#484B52]'
                                }`}
                              >
                                {/* Checkbox para Comparação */}
                                <div className="flex items-center gap-2 shrink-0">
                                  <input
                                    type="checkbox"
                                    id={`check-${item.id}`}
                                    checked={isSelected}
                                    onChange={() => toggleSelectProduct(item.id)}
                                    className="w-4.5 h-4.5 accent-[#FF4747] rounded cursor-pointer"
                                  />
                                  <div className="hidden sm:flex w-7 h-7 rounded-full bg-[#242528] border border-[#484B52] items-center justify-center text-xs font-bold text-white shrink-0 font-tabular">
                                    #{index + 1}
                                  </div>
                                </div>

                                <div className="w-20 h-20 md:w-24 md:h-24 rounded-lg overflow-hidden bg-[#1F2023] border border-[#484B52] shrink-0 flex items-center justify-center">
                                  {item.imagem_url ? (
                                    <img
                                      src={item.imagem_url}
                                      alt={item.titulo}
                                      referrerPolicy="no-referrer"
                                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                      onError={(e) => {
                                        (e.target as HTMLElement).style.display = 'none';
                                      }}
                                    />
                                  ) : (
                                    <span className="text-xs text-[#6B7280]">Sem foto</span>
                                  )}
                                </div>

                                <div className="flex-1 min-w-0 space-y-1.5">
                                  <div className="flex items-center gap-2">
                                    <span className="sm:hidden text-xs font-bold text-white font-tabular bg-[#242528] px-1.5 py-0.5 rounded border border-[#484B52]">
                                      #{index + 1}
                                    </span>
                                    <h3 className="text-base md:text-lg font-semibold text-white leading-snug line-clamp-2">
                                      {item.titulo}
                                    </h3>
                                  </div>

                                  <div className="flex flex-wrap items-baseline gap-2.5">
                                    <span className="text-xl md:text-2xl font-bold text-emerald-400 font-tabular">
                                      {item.preco_formatado}
                                    </span>
                                    <span className="text-xs md:text-sm text-[#9CA3AF]">
                                      Bruto: <code className="text-neutral-300 bg-[#242528] px-1 py-0.5 rounded">{item.preco_bruto}</code>
                                    </span>
                                    {item.loja && (
                                      <span className="text-xs text-[#9CA3AF] bg-[#242528] px-2 py-0.5 rounded border border-[#484B52]/50 truncate max-w-[200px]">
                                        🏪 {item.loja}
                                      </span>
                                    )}
                                  </div>

                                  <div className="text-[11px] text-[#9CA3AF] flex flex-wrap items-center gap-2">
                                    <span className="text-emerald-400 font-medium">✓ Float {item.preco_num}</span>
                                    {item.avaliacao && (
                                      <span>· ★ {item.avaliacao}</span>
                                    )}
                                    {item.vendas && (
                                      <span>· {item.vendas}+ pedidos</span>
                                    )}
                                  </div>
                                </div>

                                <div className="flex sm:flex-col items-center gap-2 w-full sm:w-auto shrink-0 pt-2 sm:pt-0">
                                  <button
                                    onClick={() => toggleSelectProduct(item.id)}
                                    className={`w-full sm:w-auto px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                                      isSelected
                                        ? 'bg-[#FF4747] text-white border-[#FF4747]'
                                        : 'bg-[#242528] hover:bg-[#1F2023] text-neutral-300 border-[#484B52]'
                                    }`}
                                  >
                                    {isSelected ? '✓ Selecionado' : '+ Comparar'}
                                  </button>

                                  <a
                                    href={item.link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 bg-[#484B52] hover:bg-[#FF4747] text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap"
                                  >
                                    <span>Ver Oferta</span>
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </a>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="bg-[#36383E] border border-[#484B52] rounded-xl overflow-hidden shadow-md">
                          <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="bg-[#242528] border-b border-[#484B52] text-xs md:text-sm font-semibold text-[#9CA3AF]">
                                  <th className="p-3 md:p-4 w-12 text-center">
                                    <Scale className="w-4 h-4 mx-auto text-[#9CA3AF]" />
                                  </th>
                                  <th className="p-3 md:p-4 w-14 font-tabular text-center">#</th>
                                  <th className="p-3 md:p-4">Título do Produto</th>
                                  <th className="p-3 md:p-4 text-right">Preço Tratado (BRL)</th>
                                  <th className="p-3 md:p-4">String Bruta Extraída</th>
                                  <th className="p-3 md:p-4 text-center">Ações</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[#484B52]/60 text-sm md:text-base">
                                {filteredProducts.map((item, idx) => {
                                  const isSelected = selectedForComparison.includes(item.id);

                                  return (
                                    <tr
                                      key={item.id}
                                      className={`transition-colors ${
                                        isSelected ? 'bg-[#FF4747]/10' : 'hover:bg-[#40434A]/50'
                                      }`}
                                    >
                                      <td className="p-3 md:p-4 text-center">
                                        <input
                                          type="checkbox"
                                          checked={isSelected}
                                          onChange={() => toggleSelectProduct(item.id)}
                                          className="w-4 h-4 accent-[#FF4747] rounded cursor-pointer"
                                        />
                                      </td>
                                      <td className="p-3 md:p-4 font-tabular text-center text-[#9CA3AF] font-bold">
                                        {idx + 1}
                                      </td>
                                      <td className="p-3 md:p-4 font-medium text-white max-w-md">
                                        <div className="line-clamp-2">{item.titulo}</div>
                                      </td>
                                      <td className="p-3 md:p-4 text-right font-bold text-emerald-400 font-tabular whitespace-nowrap">
                                        {item.preco_formatado}
                                      </td>
                                      <td className="p-3 md:p-4 text-[#D1D5DB] font-mono text-xs md:text-sm whitespace-nowrap">
                                        {item.preco_bruto}
                                      </td>
                                      <td className="p-3 md:p-4 text-center whitespace-nowrap space-x-2">
                                        <button
                                          onClick={() => toggleSelectProduct(item.id)}
                                          className={`text-xs px-2 py-1 rounded border transition-colors ${
                                            isSelected
                                              ? 'bg-[#FF4747] text-white border-[#FF4747]'
                                              : 'bg-[#242528] text-neutral-300 border-[#484B52]'
                                          }`}
                                        >
                                          {isSelected ? '✓ Selecionado' : 'Comparar'}
                                        </button>
                                        <a
                                          href={item.link}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-1 text-[#FF4747] hover:text-white hover:underline text-xs md:text-sm font-semibold"
                                        >
                                          <span>Abrir</span>
                                          <ExternalLink className="w-3.5 h-3.5" />
                                        </a>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* BARRA FLUTUANTE DE COMPARAÇÃO QUANDO ITENS ESTIVEREM SELECIONADOS */}
              {selectedForComparison.length > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-[#1F2023] border border-emerald-500/80 rounded-2xl px-5 py-3.5 shadow-2xl flex items-center gap-4 animate-in fade-in slide-in-from-bottom-4">
                  <div className="flex items-center gap-2">
                    <Scale className="w-5 h-5 text-emerald-400" />
                    <span className="text-sm font-bold text-white">
                      {selectedForComparison.length}{' '}
                      {selectedForComparison.length === 1 ? 'produto selecionado' : 'produtos selecionados'}
                    </span>
                  </div>

                  <button
                    onClick={() => {
                      if (selectedForComparison.length < 2) {
                        alert('Selecione pelo menos mais 1 produto para comparar lado a lado.');
                        return;
                      }
                      setIsComparisonModalOpen(true);
                    }}
                    className={`text-xs md:text-sm font-bold px-4 py-2 rounded-lg transition-all shadow-md ${
                      selectedForComparison.length >= 2
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer'
                        : 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/80 cursor-pointer'
                    }`}
                  >
                    {selectedForComparison.length >= 2 ? '⚖️ Abrir Comparação Lado a Lado' : 'Selecione +1 para Comparar'}
                  </button>

                  <button
                    onClick={() => setSelectedForComparison([])}
                    className="text-xs text-[#9CA3AF] hover:text-rose-400 underline transition-colors"
                  >
                    Desmarcar todos
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB GOOGLE DRIVE: PAINEL DE INTEGRAÇÃO COM GOOGLE DRIVE V3 */}
        {/* ========================================================================= */}
        {activeTab === 'drive' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2">
                  <Cloud className="w-6 h-6 text-blue-400" />
                  <span>Integração Google Drive (Workspace API v3)</span>
                </h2>
                <p className="text-sm text-[#9CA3AF]">
                  Sincronização de relatórios de mineração, backups do histórico e gerenciamento de arquivos na pasta{' '}
                  <code className="text-blue-300">Minerador AliExpress</code> no Google Drive.
                </p>
              </div>

              <div>
                {user ? (
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-2 bg-[#36383E] hover:bg-[#484B52] border border-[#484B52] text-white px-3.5 py-2 rounded-lg text-xs md:text-sm font-medium transition-colors"
                  >
                    <LogOut className="w-4 h-4 text-rose-400" />
                    <span>Desconectar Conta</span>
                  </button>
                ) : (
                  <button
                    onClick={handleGoogleSignIn}
                    disabled={isLoggingIn}
                    className="flex items-center gap-2 bg-white hover:bg-neutral-100 text-neutral-800 px-4 py-2 rounded-lg text-xs md:text-sm font-semibold transition-all shadow-md"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                    <span>{isLoggingIn ? 'Autenticando...' : 'Conectar com Google Drive'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Painel de Status da Conta */}
            <div className="bg-[#36383E] border border-[#484B52] rounded-xl p-5 shadow-md">
              {user ? (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    {user.photoURL ? (
                      <img
                        src={user.photoURL}
                        alt={user.displayName || 'Usuário'}
                        className="w-12 h-12 rounded-full border-2 border-blue-500/50"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-[#1F2023] border border-[#484B52] flex items-center justify-center">
                        <UserIcon className="w-6 h-6 text-[#9CA3AF]" />
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-base">{user.displayName || 'Usuário Google'}</span>
                        <span className="text-xs bg-emerald-950/80 text-emerald-400 border border-emerald-800/80 px-2 py-0.5 rounded-full font-medium">
                          Conectado
                        </span>
                      </div>
                      <p className="text-xs text-[#9CA3AF] mt-0.5">{user.email}</p>
                      <p className="text-[11px] text-[#9CA3AF]">
                        Pasta sincronizada:{' '}
                        <code className="text-blue-300">Google Drive / Minerador AliExpress</code>
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={handleSaveReportToDrive}
                      disabled={filteredProducts.length === 0}
                      className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white px-3.5 py-2 rounded-lg text-xs md:text-sm font-semibold transition-colors shadow-sm"
                    >
                      <CloudUpload className="w-4 h-4" />
                      <span>Salvar Resultados Atuais</span>
                    </button>
                    <button
                      onClick={handleBackupHistoryToDrive}
                      className="flex items-center gap-1.5 bg-[#242528] hover:bg-[#1F2023] border border-[#484B52] text-white px-3.5 py-2 rounded-lg text-xs md:text-sm font-medium transition-colors"
                    >
                      <History className="w-4 h-4 text-amber-400" />
                      <span>Backup do Histórico</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 space-y-3">
                  <div className="w-14 h-14 rounded-full bg-blue-950/60 border border-blue-500/40 flex items-center justify-center mx-auto text-blue-400">
                    <Cloud className="w-7 h-7" />
                  </div>
                  <h3 className="text-lg font-bold text-white">Conecte sua conta do Google Drive</h3>
                  <p className="text-sm text-[#9CA3AF] max-w-md mx-auto">
                    Salve planilhas CSV com os produtos minerados, sincronize termos de busca e acerte backups
                    diretamente na nuvem do Google com permissão segura do usuário.
                  </p>
                  <button
                    onClick={handleGoogleSignIn}
                    disabled={isLoggingIn}
                    className="inline-flex items-center gap-2 bg-white hover:bg-neutral-100 text-neutral-800 px-5 py-2.5 rounded-lg text-sm font-bold transition-all shadow-md mt-2"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                    <span>Sign in with Google</span>
                  </button>
                </div>
              )}
            </div>

            {/* Lista de Arquivos do Google Drive */}
            {user && (
              <div className="bg-[#36383E] border border-[#484B52] rounded-xl p-5 shadow-md space-y-4">
                <div className="flex items-center justify-between border-b border-[#484B52]/60 pb-3">
                  <div className="flex items-center gap-2">
                    <FolderOpen className="w-5 h-5 text-amber-400" />
                    <h3 className="font-bold text-white text-base">Arquivos Salvos no Google Drive</h3>
                  </div>
                  <button
                    onClick={() => accessToken && loadDriveFiles(accessToken)}
                    disabled={isLoadingDriveFiles}
                    className="text-xs text-[#9CA3AF] hover:text-white flex items-center gap-1 transition-colors"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingDriveFiles ? 'animate-spin' : ''}`} />
                    <span>Atualizar lista</span>
                  </button>
                </div>

                {isLoadingDriveFiles ? (
                  <div className="text-center py-8 text-sm text-[#9CA3AF]">
                    <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    Carregando arquivos do Google Drive...
                  </div>
                ) : driveFiles.length === 0 ? (
                  <div className="text-center py-8 text-sm text-[#9CA3AF]">
                    Nenhum relatório encontrado ainda na sua pasta do Google Drive.
                    <br />
                    Execute uma mineração e clique em <strong>"Salvar no Google Drive"</strong> para exportar.
                  </div>
                ) : (
                  <div className="divide-y divide-[#484B52]/60">
                    {driveFiles.map((file) => (
                      <div
                        key={file.id}
                        className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-[#242528]/40 px-2 rounded-lg transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <FileText className="w-5 h-5 text-blue-400 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-white truncate">{file.name}</p>
                            <div className="flex items-center gap-2 text-[11px] text-[#9CA3AF]">
                              <span>{file.createdTime ? new Date(file.createdTime).toLocaleString('pt-BR') : ''}</span>
                              {file.size && <span>· {Math.round(Number(file.size) / 1024)} KB</span>}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                          {file.webViewLink && (
                            <a
                              href={file.webViewLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-400 hover:text-blue-300 hover:underline flex items-center gap-1 bg-[#1F2023] px-2.5 py-1.5 rounded-md border border-[#484B52]"
                            >
                              <span>Abrir no Drive</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                          <button
                            onClick={() => setFileToDelete(file)}
                            className="text-xs text-[#9CA3AF] hover:text-rose-400 p-1.5 rounded hover:bg-[#1F2023] transition-colors"
                            title="Excluir arquivo do Google Drive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* MODAL DE CONFIRMAÇÃO PARA AÇÕES DESTRUTIVAS NO GOOGLE DRIVE (MANDATÓRIO) */}
        {fileToDelete && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-[#36383E] border border-rose-500/50 rounded-xl p-6 max-w-md w-full shadow-2xl space-y-4">
              <div className="flex items-center gap-3 text-rose-400">
                <AlertTriangle className="w-6 h-6 shrink-0" />
                <h3 className="text-lg font-bold text-white">Confirmar Exclusão no Google Drive</h3>
              </div>
              <p className="text-sm text-[#D1D5DB]">
                Você tem certeza que deseja remover o arquivo{' '}
                <strong className="text-white">"{fileToDelete.name}"</strong> da sua conta do Google Drive?
              </p>
              <div className="text-xs text-[#9CA3AF] bg-[#1F2023] p-3 rounded border border-[#484B52]">
                Esta ação é destrutiva e removerá o arquivo permanentemente da nuvem.
              </div>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={() => setFileToDelete(null)}
                  disabled={isDeletingFile}
                  className="bg-[#242528] hover:bg-[#1F2023] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmDeleteDriveFile}
                  disabled={isDeletingFile}
                  className="bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center gap-1.5"
                >
                  {isDeletingFile ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Excluindo...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      <span>Sim, Excluir do Drive</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL DE COMPARAÇÃO LADO A LADO DE PRODUTOS */}
        <ProductComparisonModal
          isOpen={isComparisonModalOpen}
          onClose={() => setIsComparisonModalOpen(false)}
          products={productsToCompare}
          onRemoveProduct={handleRemoveFromComparison}
          onSaveToDrive={handleSaveComparisonToDrive}
          isDriveAvailable={Boolean(user)}
        />

        {/* ========================================================================= */}
        {/* TAB 2: CÓDIGO PYTHON (app.py) */}
        {/* ========================================================================= */}
        {activeTab === 'code' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl md:text-2xl font-bold text-white">Código Fonte do app.py</h2>
                <p className="text-sm text-[#9CA3AF]">
                  Estruturado em funções modulares: <code className="text-[#FF4747]">iniciar_browser()</code>,{' '}
                  <code className="text-[#FF4747]">extrair_dados()</code>,{' '}
                  <code className="text-[#FF4747]">limpar_dados()</code>,{' '}
                  <code className="text-[#FF4747]">filtrar_por_faixa_preco()</code> e{' '}
                  <code className="text-[#FF4747]">renderizar_ui()</code>.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleCopyCode(APP_PY_CONTENT, 'code')}
                  className="flex items-center gap-1.5 bg-[#36383E] hover:bg-[#484B52] border border-[#484B52] text-white px-3.5 py-2 rounded-lg text-xs md:text-sm font-medium transition-colors"
                >
                  {copiedCode ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedCode ? 'Copiado!' : 'Copiar Código'}</span>
                </button>
                <button
                  onClick={handleDownloadPy}
                  className="flex items-center gap-1.5 bg-[#FF4747] hover:bg-[#E03E3E] text-white px-3.5 py-2 rounded-lg text-xs md:text-sm font-semibold transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>Baixar .py</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-[#36383E] border border-amber-500/60 rounded-xl p-4 text-sm text-[#D1D5DB] space-y-1">
                <div className="flex items-center gap-2 text-amber-400 font-bold">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Seletores CSS Dinâmicos do AliExpress</span>
                </div>
                <p className="text-xs">
                  O AliExpress gera classes dinâmicas com CSS Modules. O código em{' '}
                  <code className="text-white font-mono">[class*="multi--content--"]</code> garante fallback resiliente.
                </p>
              </div>

              <div className="bg-[#36383E] border border-blue-500/60 rounded-xl p-4 text-sm text-[#D1D5DB] space-y-1">
                <div className="flex items-center gap-2 text-blue-400 font-bold">
                  <Cloud className="w-4 h-4 shrink-0" />
                  <span>Integração Google Drive e Nuvem</span>
                </div>
                <p className="text-xs">
                  A interface web sincroniza com Google Drive API v3 via Firebase Auth e token Bearer client-side.
                </p>
              </div>
            </div>

            <div className="bg-[#1F2023] border border-[#484B52] rounded-xl overflow-hidden shadow-xl">
              <div className="bg-[#242528] px-4 py-2.5 border-b border-[#484B52] flex items-center justify-between text-xs text-[#9CA3AF]">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500/80" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                  <div className="w-3 h-3 rounded-full bg-green-500/80" />
                  <span className="font-mono ml-2 text-white">app.py</span>
                </div>
                <span>Python 3.11+ / UTF-8</span>
              </div>
              <pre className="p-4 md:p-6 text-xs md:text-sm font-mono text-[#E5E7EB] overflow-x-auto leading-relaxed max-h-[600px] overflow-y-auto">
                <code>{APP_PY_CONTENT}</code>
              </pre>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: REQUIREMENTS.TXT & SETUP */}
        {/* ========================================================================= */}
        {activeTab === 'requirements' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl md:text-2xl font-bold text-white">Dependências & Guia de Execução</h2>
                <p className="text-sm text-[#9CA3AF]">
                  Conteúdo exato do <code className="text-[#FF4747]">requirements.txt</code> e comandos de terminal.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleCopyCode(REQUIREMENTS_TXT_CONTENT, 'reqs')}
                  className="flex items-center gap-1.5 bg-[#36383E] hover:bg-[#484B52] border border-[#484B52] text-white px-3.5 py-2 rounded-lg text-xs md:text-sm font-medium transition-colors"
                >
                  {copiedReqs ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedReqs ? 'Copiado!' : 'Copiar requirements.txt'}</span>
                </button>
                <button
                  onClick={handleDownloadReqs}
                  className="flex items-center gap-1.5 bg-[#FF4747] hover:bg-[#E03E3E] text-white px-3.5 py-2 rounded-lg text-xs md:text-sm font-semibold transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>Baixar TXT</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-[#36383E] border border-[#484B52] rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-white flex items-center gap-2">
                    <FileText className="w-5 h-5 text-[#FF4747]" />
                    <span>Conteúdo de requirements.txt</span>
                  </h3>
                  <span className="text-xs text-[#9CA3AF]">6 bibliotecas</span>
                </div>
                <div className="bg-[#1F2023] p-4 rounded-lg font-mono text-sm text-emerald-400 border border-[#484B52]/50">
                  <pre>{REQUIREMENTS_TXT_CONTENT}</pre>
                </div>
              </div>

              <div className="bg-[#36383E] border border-[#484B52] rounded-xl p-5 space-y-3">
                <h3 className="font-semibold text-white flex items-center gap-2">
                  <Terminal className="w-5 h-5 text-[#FF4747]" />
                  <span>Comandos de Inicialização (Linux / macOS / WSL)</span>
                </h3>

                <div className="bg-[#1F2023] p-4 rounded-lg font-mono text-xs md:text-sm text-[#D1D5DB] border border-[#484B52]/50 space-y-2">
                  <p className="text-[#9CA3AF]"># 1. Crie e ative o ambiente virtual:</p>
                  <p className="text-white font-semibold">python3 -m venv venv && source venv/bin/activate</p>
                  <p className="text-[#9CA3AF] pt-1"># 2. Instale as dependências:</p>
                  <p className="text-white font-semibold">pip install -r requirements.txt</p>
                  <p className="text-[#9CA3AF] pt-1"># 3. Baixe o binário do Chromium no Playwright:</p>
                  <p className="text-white font-semibold">playwright install chromium</p>
                  <p className="text-[#9CA3AF] pt-1"># 4. Inicie o Streamlit na cor chumbo:</p>
                  <p className="text-emerald-400 font-semibold">streamlit run app.py</p>
                </div>
              </div>
            </div>

            <div className="bg-[#36383E] border border-[#484B52] rounded-xl p-6">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <Layers className="w-5 h-5 text-[#FF4747]" />
                <span>Fluxo da Arquitetura com Google Drive</span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                <div className="bg-[#242528] p-4 rounded-lg border border-[#484B52]">
                  <div className="font-bold text-[#FF4747] mb-1">01. Playwright + Stealth</div>
                  <p className="text-xs text-[#9CA3AF]">
                    Inicia Chromium headless mascarando automação para contornar CAPTCHAs e bloqueios anti-bot.
                  </p>
                </div>

                <div className="bg-[#242528] p-4 rounded-lg border border-[#484B52]">
                  <div className="font-bold text-[#FF4747] mb-1">02. Scroll & Histórico</div>
                  <p className="text-xs text-[#9CA3AF]">
                    Executa rolagens de 1000px com pausas aleatórias e salva o termo em <code>historico_buscas.json</code>.
                  </p>
                </div>

                <div className="bg-[#242528] p-4 rounded-lg border border-[#484B52]">
                  <div className="font-bold text-[#FF4747] mb-1">03. Regex Sanitizer</div>
                  <p className="text-xs text-[#9CA3AF]">
                    Elimina textos ("R$", impostos, frete), converte separador de milhar e vírgula decimal em float.
                  </p>
                </div>

                <div className="bg-[#242528] p-4 rounded-lg border border-[#484B52]">
                  <div className="font-bold text-blue-400 mb-1">04. Google Drive Sync</div>
                  <p className="text-xs text-[#9CA3AF]">
                    Exporta planilhas diretamente para o Google Drive e gerencia backups com confirmação de ações.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: LABORATÓRIO DE REGEX & SELETORES */}
        {/* ========================================================================= */}
        {activeTab === 'regex' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-white">Laboratório Interativo de Regex Monetário</h2>
              <p className="text-sm text-[#9CA3AF]">
                Teste como a expressão regular trata qualquer string monetária do AliExpress em tempo real.
              </p>
            </div>

            <div className="bg-[#36383E] border border-[#484B52] rounded-xl p-5 md:p-6 space-y-4">
              <label className="block text-sm md:text-base font-semibold text-white">
                Digite ou selecione uma string bruta de teste:
              </label>

              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  value={testString}
                  onChange={(e) => setTestString(e.target.value)}
                  className="flex-1 bg-[#1F2023] border border-[#484B52] focus:border-[#FF4747] text-white text-base md:text-lg px-4 py-3 rounded-lg font-mono outline-none"
                  placeholder="Ex: R$ 1.450,99 + impostos"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-[#9CA3AF]">Testar exemplos:</span>
                {[
                  'R$ 1.450,99 + impostos',
                  'R$ 89,90 Frete grátis',
                  'R$ 14,50',
                  '12.999,00',
                  'US $45.20',
                  'R$ 0,00',
                  'Esgotado / Indisponível',
                ].map((ex) => (
                  <button
                    key={ex}
                    onClick={() => setTestString(ex)}
                    className="bg-[#242528] hover:bg-[#484B52] text-[#D1D5DB] px-2.5 py-1 rounded transition-colors"
                  >
                    {ex}
                  </button>
                ))}
              </div>

              <div className="bg-[#1F2023] border border-[#484B52] rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-[#484B52]/60 pb-2">
                  <span className="text-sm font-semibold text-white">Rastreamento da Expressão Regular:</span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded font-semibold ${
                      testResult.isValid ? 'bg-emerald-900/60 text-emerald-400' : 'bg-rose-900/60 text-rose-400'
                    }`}
                  >
                    {testResult.isValid ? 'Preço Válido' : 'Descartado'}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs md:text-sm">
                  <div>
                    <span className="text-[#9CA3AF] block">1. Entrada bruta:</span>
                    <code className="text-white font-mono bg-[#242528] px-2 py-1 rounded block mt-0.5">
                      {testResult.raw || '(vazio)'}
                    </code>
                  </div>

                  <div>
                    <span className="text-[#9CA3AF] block">2. Capturado pela Regex:</span>
                    <code className="text-amber-400 font-mono bg-[#242528] px-2 py-1 rounded block mt-0.5">
                      {testResult.matchedString || 'Nenhum match'}
                    </code>
                  </div>

                  <div>
                    <span className="text-[#9CA3AF] block">3. Remoção de milhar (.):</span>
                    <code className="text-blue-400 font-mono bg-[#242528] px-2 py-1 rounded block mt-0.5">
                      {testResult.thousandSeparatorRemoved || '-'}
                    </code>
                  </div>

                  <div>
                    <span className="text-[#9CA3AF] block">4. Vírgula decimal para ponto (, → .):</span>
                    <code className="text-purple-400 font-mono bg-[#242528] px-2 py-1 rounded block mt-0.5">
                      {testResult.decimalConverted || '-'}
                    </code>
                  </div>
                </div>

                <div className="pt-2 border-t border-[#484B52]/60 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-[#9CA3AF]">Float Final do Pandas:</span>
                    <div className="text-lg md:text-xl font-bold font-tabular text-emerald-400">
                      {testResult.numericValue !== null ? `${testResult.numericValue}` : 'None'}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-[#9CA3AF]">Formatação BRL:</span>
                    <div className="text-lg md:text-xl font-bold font-tabular text-white">
                      {testResult.formattedBRL || 'N/A'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* FOOTER */}
      <footer className="border-t border-[#484B52] bg-[#242528] py-4 px-6 text-center text-xs text-[#9CA3AF]">
        <p>
          Minerador AliExpress · Python 3.11+ · Playwright Stealth · Google Drive API v3 · Pandas · Fundo Chumbo (#2B2C30)
        </p>
      </footer>
    </div>
  );
}
