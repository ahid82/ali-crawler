/**
 * Lógica de Limpeza de Preço do AliExpress espelhando o script Python (app.py).
 * Aplica expressões regulares para extrair e higienizar valores monetários BRL.
 */

export interface CleaningStep {
  raw: string;
  matchedString: string | null;
  thousandSeparatorRemoved: string | null;
  decimalConverted: string | null;
  numericValue: number | null;
  formattedBRL: string | null;
  isValid: boolean;
  statusMessage: string;
}

export function cleanAliExpressPrice(priceStr: string | null | undefined): CleaningStep {
  if (!priceStr || typeof priceStr !== 'string') {
    return {
      raw: String(priceStr || ''),
      matchedString: null,
      thousandSeparatorRemoved: null,
      decimalConverted: null,
      numericValue: null,
      formattedBRL: null,
      isValid: false,
      statusMessage: 'Entrada vazia ou tipo não textual',
    };
  }

  const raw = priceStr.trim();
  // Regex idêntica ao app.py: captura blocos monetários com ou sem separador de milhar e centavos
  const pattern = /(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|\d+\.\d{2}|\d+)/;
  const match = raw.match(pattern);

  if (!match) {
    return {
      raw,
      matchedString: null,
      thousandSeparatorRemoved: null,
      decimalConverted: null,
      numericValue: null,
      formattedBRL: null,
      isValid: false,
      statusMessage: 'Nenhum padrão numérico monetário capturado pela Regex',
    };
  }

  const matchedString = match[1];
  let thousandRemoved = matchedString;
  let decimalConverted = matchedString;

  if (matchedString.includes(',')) {
    // 1. Remove o ponto separador de milhar: 1.450,99 -> 1450,99
    thousandRemoved = matchedString.replace(/\./g, '');
    // 2. Substitui a vírgula decimal por ponto: 1450,99 -> 1450.99
    decimalConverted = thousandRemoved.replace(',', '.');
  } else {
    thousandRemoved = matchedString;
    decimalConverted = matchedString;
  }

  const numericValue = parseFloat(decimalConverted);

  if (isNaN(numericValue) || numericValue <= 0) {
    return {
      raw,
      matchedString,
      thousandSeparatorRemoved: thousandRemoved,
      decimalConverted,
      numericValue: null,
      formattedBRL: null,
      isValid: false,
      statusMessage: 'Valor descartado: preço igual a zero, negativo ou NaN',
    };
  }

  const rounded = Math.round(numericValue * 100) / 100;
  const formattedBRL = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(rounded);

  return {
    raw,
    matchedString,
    thousandSeparatorRemoved: thousandRemoved,
    decimalConverted,
    numericValue: rounded,
    formattedBRL,
    isValid: true,
    statusMessage: 'Preço validado com sucesso e convertido em float',
  };
}

export function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}
