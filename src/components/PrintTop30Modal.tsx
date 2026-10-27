import React, { useRef, useState, useEffect } from 'react';
import { toPng, toBlob } from 'html-to-image';
import { Download, Copy, Printer, X, Check, Camera, RefreshCw, ZoomIn } from 'lucide-react';
import { N, RenderMoney } from '../utils/formatters';

interface RankingItem {
  rank: number;
  c: number;
  d: string;
  qtde: number;
  valor: number;
  peso: number;
  analysis?: {
    status: 'verde' | 'laranja' | 'vermelho';
    diff: number;
    hoje: number;
    ontem: number;
    label: string;
    bg: string;
    color: string;
  };
}

interface PrintTop30ModalProps {
  isOpen: boolean;
  onClose: () => void;
  faltas: RankingItem[];
  sobras: RankingItem[];
  totalFaltas: number;
  totalSobras: number;
  saldoFinal: number;
  colorScaleF?: (v: number) => string;
  colorScaleS?: (v: number) => string;
  dateLabel?: string;
}

export const PrintTop30Modal: React.FC<PrintTop30ModalProps> = ({
  isOpen,
  onClose,
  faltas,
  sobras,
  totalFaltas,
  totalSobras,
  saldoFinal,
  colorScaleF = () => '#fff',
  colorScaleS = () => '#fff',
  dateLabel,
}) => {
  const printRef = useRef<HTMLDivElement>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  // Take top 30 exactly
  const top30Faltas = faltas.slice(0, 30);
  const top30Sobras = sobras.slice(0, 30);
  const rowCount = Math.max(30, Math.max(top30Faltas.length, top30Sobras.length));
  const rowIndices = Array.from({ length: 30 }, (_, i) => i);

  // Formatted date and time
  const todayStr = dateLabel || new Date().toLocaleDateString('pt-BR');
  const timeStr = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  // Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleDownloadImage = async () => {
    if (!printRef.current) return;
    try {
      setIsCapturing(true);
      const dataUrl = await toPng(printRef.current, {
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        skipFonts: true,
        fontEmbedCSS: '',
        cacheBust: false,
      });
      const link = document.createElement('a');
      const safeDate = todayStr.replace(/\//g, '-');
      link.download = `Print_Estoque_Top30_Faltas_Sobras_${safeDate}.png`;
      link.href = dataUrl;
      link.click();
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 3000);
    } catch (err) {
      console.warn('Não foi possível gerar PNG diretamente:', err);
      alert('Não foi possível gerar a imagem diretamente. Tente a opção de Imprimir.');
    } finally {
      setIsCapturing(false);
    }
  };

  const handleCopyToClipboard = async () => {
    if (!printRef.current) return;
    try {
      setIsCapturing(true);
      const blob = await toBlob(printRef.current, {
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        skipFonts: true,
        fontEmbedCSS: '',
        cacheBust: false,
      });

      if (!blob) {
        throw new Error('Falha ao gerar imagem.');
      }

      // Tenta copiar para área de transferência se suportado e permitido pelo navegador
      if (navigator.clipboard?.write && window.ClipboardItem) {
        try {
          window.focus();
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob }),
          ]);
          setCopied(true);
          setTimeout(() => setCopied(false), 3000);
          return;
        } catch (clipErr) {
          // Em ambientes de iframe (como o preview do AI Studio), a permissão de clipboard pode ser negada pelo navegador.
          // Fallback silencioso e transparente: realiza o download automático da imagem
          console.warn('Cópia direta restrita no iframe, realizando download da imagem:', clipErr);
        }
      }

      // Fallback: faz o download do blob diretamente
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const safeDate = todayStr.replace(/\//g, '-');
      link.download = `Print_Estoque_Top30_Faltas_Sobras_${safeDate}.png`;
      link.href = url;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 3000);
    } catch (err) {
      console.warn('Aviso na captura de imagem:', err);
      // Fallback de download seguro
      handleDownloadImage();
    } finally {
      setIsCapturing(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        padding: '16px',
        overflowY: 'auto',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* TOOLBAR SUPERIOR */}
      <div
        style={{
          width: '100%',
          maxWidth: '1240px',
          background: '#1e293b',
          color: '#fff',
          borderRadius: '8px 8px 0 0',
          padding: '10px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          borderBottom: '2px solid #FFC000',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              background: '#FFC000',
              color: '#000',
              padding: '5px 10px',
              borderRadius: '5px',
              fontWeight: '900',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Camera size={16} />
            <span>PRINT DA TELA • TOP 30 FALTAS & SOBRAS</span>
          </div>
          <span style={{ fontSize: '12px', color: '#cbd5e1' }}>
            Rendimento completo: 30 faltas e 30 sobras sem cortes
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Botão Baixar PNG */}
          <button
            type="button"
            onClick={handleDownloadImage}
            disabled={isCapturing}
            style={{
              background: downloadSuccess ? '#059669' : '#0284c7',
              color: '#fff',
              border: 'none',
              borderRadius: '5px',
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 'bold',
              cursor: isCapturing ? 'wait' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
              transition: 'background 0.2s',
            }}
            title="Baixar imagem PNG de alta resolução"
          >
            {downloadSuccess ? <Check size={14} /> : <Download size={14} />}
            <span>{downloadSuccess ? 'Baixado!' : isCapturing ? 'Gerando PNG...' : 'Baixar Imagem PNG'}</span>
          </button>

          {/* Botão Copiar para WhatsApp */}
          <button
            type="button"
            onClick={handleCopyToClipboard}
            disabled={isCapturing}
            style={{
              background: copied ? '#059669' : '#25D366',
              color: copied ? '#fff' : '#075E54',
              border: 'none',
              borderRadius: '5px',
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 'bold',
              cursor: isCapturing ? 'wait' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
            }}
            title="Copiar imagem para colar diretamente no WhatsApp Web"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            <span>{copied ? 'Copiado para a área de transferência!' : 'Copiar Imagem (WhatsApp)'}</span>
          </button>

          {/* Botão Imprimir */}
          <button
            type="button"
            onClick={handlePrint}
            style={{
              background: '#475569',
              color: '#fff',
              border: 'none',
              borderRadius: '5px',
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
            }}
            title="Imprimir relatório"
          >
            <Printer size={14} />
            <span>Imprimir</span>
          </button>

          {/* Fechar */}
          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#dc2626',
              color: '#fff',
              border: 'none',
              borderRadius: '5px',
              padding: '6px 10px',
              fontSize: '12px',
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <X size={15} />
            <span>Fechar</span>
          </button>
        </div>
      </div>

      {/* ÁREA DE VISUALIZAÇÃO COM ROLAGEM / CONTAINER DE CAPTURA */}
      <div
        style={{
          width: '100%',
          maxWidth: '1240px',
          background: '#fff',
          borderRadius: '0 0 8px 8px',
          padding: '12px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
          overflowX: 'auto',
        }}
      >
        {/* ELEMENTO EXATO QUE SERÁ CAPTURADO COMO IMAGEM */}
        <div
          ref={printRef}
          id="print-top30-card"
          style={{
            background: '#ffffff',
            padding: '14px',
            borderRadius: '6px',
            border: '1px solid #d1d5db',
            minWidth: '1080px',
            fontFamily: '"Century Gothic", "Segoe UI", Arial, sans-serif',
            color: '#000',
            boxSizing: 'border-box',
          }}
        >
          {/* CABEÇALHO DO PRINT */}
          <div
            style={{
              background: '#FFC000',
              padding: '8px 14px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '10px',
              borderBottom: '2px solid #d97706',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '16px', fontWeight: '900', color: '#111827', letterSpacing: '0.3px' }}>
                ESTOQUE OFICIAL GUARABIRA
              </span>
              <span style={{ background: '#000', color: '#FFC000', fontSize: '10px', fontWeight: 'bold', padding: '2px 8px', borderRadius: '3px' }}>
                TOP 30 FALTAS & TOP 30 SOBRAS
              </span>
            </div>
            <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#1f2937' }}>
              Data: {todayStr} • Hora: {timeStr}
            </div>
          </div>

          {/* CORPO: TABELAS LADO A LADO + PAINEL DE TOTAIS */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', width: '100%' }}>
            {/* TABELA DE 30 FALTAS E 30 SOBRAS */}
            <div style={{ flex: '1 1 auto', overflow: 'hidden' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'separate',
                  borderSpacing: 0,
                  fontSize: '11px',
                  tableLayout: 'fixed',
                }}
              >
                <colgroup>
                  {/* Faltas */}
                  <col style={{ width: '26px' }} />
                  <col style={{ width: '46px' }} />
                  <col style={{ width: '185px' }} />
                  <col style={{ width: '52px' }} />
                  <col style={{ width: '86px' }} />
                  <col style={{ width: '44px' }} />
                  {/* Espaçador */}
                  <col style={{ width: '8px' }} />
                  {/* Sobras */}
                  <col style={{ width: '26px' }} />
                  <col style={{ width: '46px' }} />
                  <col style={{ width: '185px' }} />
                  <col style={{ width: '52px' }} />
                  <col style={{ width: '86px' }} />
                  <col style={{ width: '44px' }} />
                </colgroup>
                <thead>
                  {/* LINHA 1: TÍTULO AMARELO */}
                  <tr>
                    <th
                      colSpan={6}
                      style={{
                        background: 'linear-gradient(180deg, #FFD966 0%, #FFC000 100%)',
                        color: '#000',
                        fontSize: '13px',
                        fontWeight: '900',
                        textAlign: 'center',
                        padding: '6px 4px',
                        borderRight: '1px solid rgba(0,0,0,0.1)',
                        letterSpacing: '0.5px',
                      }}
                    >
                      RANKING DE FALTAS (TOP 30)
                    </th>
                    <th style={{ background: '#fff', border: 'none', padding: 0 }}></th>
                    <th
                      colSpan={6}
                      style={{
                        background: 'linear-gradient(180deg, #FFD966 0%, #FFC000 100%)',
                        color: '#000',
                        fontSize: '13px',
                        fontWeight: '900',
                        textAlign: 'center',
                        padding: '6px 4px',
                        borderLeft: '1px solid rgba(0,0,0,0.1)',
                        letterSpacing: '0.5px',
                      }}
                    >
                      RANKING DE SOBRAS (TOP 30)
                    </th>
                  </tr>
                  {/* LINHA 2: CABEÇALHOS ESCUROS */}
                  <tr>
                    <th style={{ background: '#1b1b1b', color: '#fff', fontSize: '10px', padding: '4px 2px', textAlign: 'center' }}>#</th>
                    <th style={{ background: '#1b1b1b', color: '#fff', fontSize: '10px', padding: '4px 2px', textAlign: 'center' }}>COD</th>
                    <th style={{ background: '#1b1b1b', color: '#fff', fontSize: '10px', padding: '4px 4px', textAlign: 'center' }}>DESCRIÇÃO</th>
                    <th style={{ background: '#1b1b1b', color: '#fff', fontSize: '10px', padding: '4px 2px', textAlign: 'center' }}>QTDE</th>
                    <th style={{ background: '#1b1b1b', color: '#fff', fontSize: '10px', padding: '4px 4px', textAlign: 'center' }}>VALOR R$</th>
                    <th style={{ background: '#1b1b1b', color: '#fff', fontSize: '10px', padding: '4px 2px', textAlign: 'center' }}>PESO</th>
                    <th style={{ background: '#fff', border: 'none', padding: 0 }}></th>
                    <th style={{ background: '#1b1b1b', color: '#fff', fontSize: '10px', padding: '4px 2px', textAlign: 'center' }}>#</th>
                    <th style={{ background: '#1b1b1b', color: '#fff', fontSize: '10px', padding: '4px 2px', textAlign: 'center' }}>COD</th>
                    <th style={{ background: '#1b1b1b', color: '#fff', fontSize: '10px', padding: '4px 4px', textAlign: 'center' }}>DESCRIÇÃO</th>
                    <th style={{ background: '#1b1b1b', color: '#fff', fontSize: '10px', padding: '4px 2px', textAlign: 'center' }}>QTDE</th>
                    <th style={{ background: '#1b1b1b', color: '#fff', fontSize: '10px', padding: '4px 4px', textAlign: 'center' }}>VALOR R$</th>
                    <th style={{ background: '#1b1b1b', color: '#fff', fontSize: '10px', padding: '4px 2px', textAlign: 'center' }}>PESO</th>
                  </tr>
                </thead>
                <tbody>
                  {rowIndices.map((i) => {
                    const rf = top30Faltas[i];
                    const rs = top30Sobras[i];
                    const rankNum = i + 1;
                    const isEven = i % 2 === 0;
                    const rowBg = isEven ? '#ffffff' : '#fcfcfc';

                    return (
                      <tr key={i} style={{ height: '18px', background: rowBg }}>
                        {/* FALTAS COLUMNS */}
                        {rf ? (
                          <>
                            <td
                              style={{
                                textAlign: 'center',
                                padding: '1px 2px',
                                borderBottom: '1px solid #e5e7eb',
                                color: rf.analysis ? rf.analysis.color : '#C00000',
                                background: rf.analysis ? rf.analysis.bg : undefined,
                                fontWeight: 'bold',
                                fontSize: '10.5px',
                              }}
                            >
                              {rf.rank || rankNum}
                            </td>
                            <td
                              style={{
                                textAlign: 'center',
                                padding: '1px 2px',
                                borderBottom: '1px solid #e5e7eb',
                                fontWeight: 'bold',
                                fontFamily: 'monospace',
                                fontSize: '10.5px',
                                color: '#111827',
                              }}
                            >
                              {rf.c}
                            </td>
                            <td
                              style={{
                                padding: '1px 4px',
                                borderBottom: '1px solid #e5e7eb',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                fontSize: '10px',
                                color: '#1f2937',
                              }}
                              title={rf.d}
                            >
                              {rf.d}
                            </td>
                            <td
                              style={{
                                textAlign: 'center',
                                padding: '1px 2px',
                                borderBottom: '1px solid #e5e7eb',
                                fontFamily: 'monospace',
                                fontWeight: 'bold',
                                fontSize: '10.5px',
                                color: rf.analysis ? rf.analysis.color : '#C00000',
                                background: rf.analysis ? rf.analysis.bg : undefined,
                              }}
                            >
                              {N(rf.qtde)}
                            </td>
                            <td
                              style={{
                                padding: '1px 4px',
                                borderBottom: '1px solid #e5e7eb',
                                fontSize: '10.5px',
                              }}
                            >
                              <RenderMoney value={rf.valor} />
                            </td>
                            <td
                              style={{
                                textAlign: 'center',
                                padding: '1px 2px',
                                borderBottom: '1px solid #e5e7eb',
                                background: rf.analysis ? rf.analysis.bg : colorScaleF(rf.peso),
                                color: rf.analysis ? rf.analysis.color : '#000',
                                fontWeight: 'bold',
                                fontSize: '10px',
                              }}
                            >
                              {Math.round(rf.peso * 100)}%
                            </td>
                          </>
                        ) : (
                          <>
                            <td style={{ borderBottom: '1px solid #e5e7eb', textAlign: 'center', color: '#9ca3af', fontSize: '10px' }}>{rankNum}</td>
                            <td style={{ borderBottom: '1px solid #e5e7eb' }}>-</td>
                            <td style={{ borderBottom: '1px solid #e5e7eb', color: '#9ca3af' }}>-</td>
                            <td style={{ borderBottom: '1px solid #e5e7eb', textAlign: 'center' }}>-</td>
                            <td style={{ borderBottom: '1px solid #e5e7eb' }}>-</td>
                            <td style={{ borderBottom: '1px solid #e5e7eb', textAlign: 'center' }}>-</td>
                          </>
                        )}

                        {/* ESPAÇADOR CENTRAL */}
                        <td style={{ background: '#fff', border: 'none', padding: 0 }}></td>

                        {/* SOBRAS COLUMNS */}
                        {rs ? (
                          <>
                            <td
                              style={{
                                textAlign: 'center',
                                padding: '1px 2px',
                                borderBottom: '1px solid #e5e7eb',
                                color: rs.analysis ? rs.analysis.color : '#C00000',
                                background: rs.analysis ? rs.analysis.bg : undefined,
                                fontWeight: 'bold',
                                fontSize: '10.5px',
                              }}
                            >
                              {rs.rank || rankNum}
                            </td>
                            <td
                              style={{
                                textAlign: 'center',
                                padding: '1px 2px',
                                borderBottom: '1px solid #e5e7eb',
                                fontWeight: 'bold',
                                fontFamily: 'monospace',
                                fontSize: '10.5px',
                                color: '#111827',
                              }}
                            >
                              {rs.c}
                            </td>
                            <td
                              style={{
                                padding: '1px 4px',
                                borderBottom: '1px solid #e5e7eb',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                fontSize: '10px',
                                color: '#1f2937',
                              }}
                              title={rs.d}
                            >
                              {rs.d}
                            </td>
                            <td
                              style={{
                                textAlign: 'center',
                                padding: '1px 2px',
                                borderBottom: '1px solid #e5e7eb',
                                fontFamily: 'monospace',
                                fontWeight: 'bold',
                                fontSize: '10.5px',
                                color: rs.analysis ? rs.analysis.color : rs.qtde > 0 ? '#047857' : '#C00000',
                                background: rs.analysis ? rs.analysis.bg : undefined,
                              }}
                            >
                              {N(rs.qtde)}
                            </td>
                            <td
                              style={{
                                padding: '1px 4px',
                                borderBottom: '1px solid #e5e7eb',
                                fontSize: '10.5px',
                              }}
                            >
                              <RenderMoney value={rs.valor} />
                            </td>
                            <td
                              style={{
                                textAlign: 'center',
                                padding: '1px 2px',
                                borderBottom: '1px solid #e5e7eb',
                                background: rs.analysis ? rs.analysis.bg : colorScaleS(rs.peso),
                                color: rs.analysis ? rs.analysis.color : '#000',
                                fontWeight: 'bold',
                                fontSize: '10px',
                              }}
                            >
                              {Math.round(rs.peso * 100)}%
                            </td>
                          </>
                        ) : (
                          <>
                            <td style={{ borderBottom: '1px solid #e5e7eb', textAlign: 'center', color: '#9ca3af', fontSize: '10px' }}>{rankNum}</td>
                            <td style={{ borderBottom: '1px solid #e5e7eb' }}>-</td>
                            <td style={{ borderBottom: '1px solid #e5e7eb', color: '#9ca3af' }}>-</td>
                            <td style={{ borderBottom: '1px solid #e5e7eb', textAlign: 'center' }}>-</td>
                            <td style={{ borderBottom: '1px solid #e5e7eb' }}>-</td>
                            <td style={{ borderBottom: '1px solid #e5e7eb', textAlign: 'center' }}>-</td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* PAINEL LATERAL DE TOTAIS (IDÊNTICO À FOTO) */}
            <div
              style={{
                width: '185px',
                flex: 'none',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                background: '#fafafa',
                padding: '8px',
                border: '1px solid #e2e8f0',
                borderRadius: '5px',
              }}
            >
              {/* CARD FALTAS R$ */}
              <div
                style={{
                  border: '1px solid #d1d5db',
                  borderRadius: '3px',
                  overflow: 'hidden',
                  background: '#fff',
                }}
              >
                <div
                  style={{
                    background: '#1b1b1b',
                    color: '#fff',
                    fontSize: '10px',
                    fontWeight: 'bold',
                    textAlign: 'center',
                    padding: '4px',
                    letterSpacing: '0.3px',
                  }}
                >
                  FALTAS R$
                </div>
                <div
                  style={{
                    fontSize: '13px',
                    fontWeight: 'bold',
                    padding: '8px 4px',
                    textAlign: 'center',
                    color: '#C00000',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                  }}
                >
                  <span style={{ fontSize: '10px', color: '#6b7280' }}>R$</span>
                  <span>{N(totalFaltas)}</span>
                </div>
              </div>

              {/* CARD SOBRAS R$ */}
              <div
                style={{
                  border: '1px solid #d1d5db',
                  borderRadius: '3px',
                  overflow: 'hidden',
                  background: '#fff',
                }}
              >
                <div
                  style={{
                    background: '#1b1b1b',
                    color: '#fff',
                    fontSize: '10px',
                    fontWeight: 'bold',
                    textAlign: 'center',
                    padding: '4px',
                    letterSpacing: '0.3px',
                  }}
                >
                  SOBRAS R$
                </div>
                <div
                  style={{
                    fontSize: '13px',
                    fontWeight: 'bold',
                    padding: '8px 4px',
                    textAlign: 'center',
                    color: '#047857',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                  }}
                >
                  <span style={{ fontSize: '10px', color: '#6b7280' }}>R$</span>
                  <span>{N(totalSobras)}</span>
                </div>
              </div>

              {/* CARD SALDO FINAL */}
              <div
                style={{
                  border: '1px solid #d1d5db',
                  borderRadius: '3px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    background: '#1b1b1b',
                    color: '#fff',
                    fontSize: '10px',
                    fontWeight: 'bold',
                    textAlign: 'center',
                    padding: '4px',
                    letterSpacing: '0.3px',
                  }}
                >
                  SALDO FINAL
                </div>
                <div
                  style={{
                    fontSize: '13px',
                    fontWeight: '900',
                    padding: '8px 4px',
                    textAlign: 'center',
                    background: saldoFinal < 0 ? '#FFC7CE' : '#C6EFCE',
                    color: saldoFinal < 0 ? '#9C0006' : '#006100',
                  }}
                >
                  <span>{saldoFinal < 0 ? '-R$' : 'R$'}</span>{' '}
                  <span>{N(Math.abs(saldoFinal))}</span>
                </div>
              </div>

              {/* BADGE INFORMATIVO */}
              <div
                style={{
                  background: '#f1f5f9',
                  border: '1px dashed #cbd5e1',
                  borderRadius: '3px',
                  padding: '6px',
                  fontSize: '9.5px',
                  color: '#475569',
                  textAlign: 'center',
                  lineHeight: '1.3',
                  marginTop: 'auto',
                }}
              >
                <b>Relatório TOP 30</b>
                <div>30 maiores faltas apuradas</div>
                <div>30 maiores sobras apuradas</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
