export const MAX_SEGUNDOS_AUDIO = 90; // 1 minuto e 30 segundos
export const horarios = ['10:00', '13:00', '16:00'];
export const estilosTattoo = ['Fine Line', 'Blackwork', 'Realismo', 'Old School', 'Minimalista', 'Ornamental', 'Lettering', 'Outro'];
export const regioes = ['Braço', 'Antebraço', 'Mão', 'Perna', 'Coxa', 'Costas', 'Peito', 'Costela', 'Outro'];

// arranca tudo q não é número de um texto (tipo telefone, data e tamanho)
export const apenasDigitos = s => String(s || '').replace(/\D/g, '');

// transforma os segundos no formato 00:00 pra mostrar o tempo do áudio
export function formatarSegundos(totalSeg) {
  const seg = Math.max(0, Math.floor(Number(totalSeg) || 0));
  const m = String(Math.floor(seg / 60)).padStart(2, '0');
  const s = String(seg % 60).padStart(2, '0');
  return `${m}:${s}`;
}

// bota a máscara (21) 99999-9999 enquanto o cliente digita o zap
export function mascaraTelefone(valor) {
  const d = apenasDigitos(valor).slice(0, 11);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

// bota as barras da data (DD/MM/AAAA) enquanto vai digitando
export function mascaraData(valor) {
  const d = apenasDigitos(valor).slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

// pega a data BR, vê se existe msm e converte pro formato do banco (AAAA-MM-DD)
export function dataBrParaIso(dataBr) {
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(dataBr)) return null;
  const [dd, mm, yyyy] = dataBr.split('/');
  const y = Number(yyyy);
  const m = Number(mm);
  const d = Number(dd);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return `${yyyy}-${mm}-${dd}`;
}

// pega a data do banco (AAAA-MM-DD) e volta pro formato BR (DD/MM/AAAA)
export function dataIsoParaBr(dataIso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dataIso || ''))) return dataIso;
  const [yyyy, mm, dd] = dataIso.split('-');
  return `${dd}/${mm}/${yyyy}`;
}

// limpa o telefone e bota o 55 na frente pro link do zap abrir certinho
export function normalizarTelefone(valor) {
  const d = apenasDigitos(valor);
  if (/^55\d{10,11}$/.test(d)) return d;
  const local = d.slice(0, 11);
  if (local.length === 10 || local.length === 11) return '55' + local;
  return local;
}

// junta data e hora em milissegundos pra checar se tem 2h de antecedência
export function dataHoraParaMs(dataIso, horaStr) {
  if (!dataIso || !/^\d{4}-\d{2}-\d{2}$/.test(dataIso)) return null;
  const [y, m, d] = dataIso.split('-').map(Number);
  const [hh, mm] = horaStr.split(':').map(Number);
  const dt = new Date(y, m - 1, d, hh, mm, 0, 0);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return dt.getTime();
}