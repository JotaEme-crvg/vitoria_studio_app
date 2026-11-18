import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, Alert, Linking, StatusBar } from 'react-native';
import * as Sharing from 'expo-sharing';
import {
  useAudioRecorder,
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus
} from 'expo-audio';
import { initDatabase } from './src/database/connection';
import { authenticateAdmin } from './src/database/adminRepository';
import {
  getOccupiedTimesByDate,
  createBookingWithReminders,
  syncAndGetAdminDashboard,
  cancelBookingById,
  markReminderAsSent
} from './src/database/bookingRepository';

const MAX_AUDIO_SECONDS = 90; // 1 minuto e 30 segundos
const times = ['10:00', '13:00', '16:00'];
const stylesTattoo = ['Fine Line', 'Blackwork', 'Realismo', 'Old School', 'Minimalista', 'Ornamental', 'Lettering', 'Outro'];
const regions = ['Braço', 'Antebraço', 'Mão', 'Perna', 'Coxa', 'Costas', 'Peito', 'Costela', 'Outro'];
const palette = { bg: '#090909', card: '#171717', line: '#333', white: '#fff', muted: '#aaa' };
const digits = s => String(s || '').replace(/\D/g, '');

function formatSeconds(totalSec) {
  const sec = Math.max(0, Math.floor(Number(totalSec) || 0));
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function formatPhoneMask(raw) {
  const d = digits(raw).slice(0, 11);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function formatDateMask(raw) {
  const d = digits(raw).slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

function brDateToIso(brDate) {
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(brDate)) return null;
  const [dd, mm, yyyy] = brDate.split('/');
  const y = Number(yyyy);
  const m = Number(mm);
  const d = Number(dd);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return `${yyyy}-${mm}-${dd}`;
}

function isoToBrDate(isoDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(isoDate || ''))) return isoDate;
  const [yyyy, mm, dd] = isoDate.split('-');
  return `${dd}/${mm}/${yyyy}`;
}

function normalizePhone(raw) {
  const d = digits(raw);
  if (/^55\d{10,11}$/.test(d)) return d;
  const local = d.slice(0, 11);
  if (local.length === 10 || local.length === 11) return '55' + local;
  return local;
}

function parseLocalDateTime(isoDateStr, timeStr) {
  if (!isoDateStr || !/^\d{4}-\d{2}-\d{2}$/.test(isoDateStr)) return null;
  const [y, m, d] = isoDateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  const dt = new Date(y, m - 1, d, hh, mm, 0, 0);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return dt.getTime();
}

function AudioPreview({ uri, duration }) {
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);

  const togglePlay = () => {
    if (status.playing) {
      player.pause();
    } else {
      if (status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration - 0.1)) {
        player.seekTo(0);
      }
      player.play();
    }
  };

  return (
    <TouchableOpacity style={s.audioPlayBtn} onPress={togglePlay}>
      <Text style={s.audioPlayText}>
        {status.playing ? '⏸️  PAUSAR ÁUDIO' : `▶️  OUVIR ÁUDIO (${formatSeconds(duration)})`}
      </Text>
    </TouchableOpacity>
  );
}

export default function App() {
  const [page, setPage] = useState('home');
  const [adminUser, setAdminUser] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [occupiedTimes, setOccupiedTimes] = useState([]);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const stoppingRef = useRef(false);

  const [form, setForm] = useState({
    nome: '', whatsapp: '', data: '', hora: '10:00',
    estilo: stylesTattoo[0], regiao: regions[0], tamanho: '',
    ideia: '', audioUri: '', audioDuration: 0, consent: false
  });

  const update = (key, value) => {
    let nextValue = value;
    if (key === 'whatsapp') nextValue = formatPhoneMask(value);
    if (key === 'data') nextValue = formatDateMask(value);
    if (key === 'tamanho') nextValue = digits(value).slice(0, 3);
    setForm(f => ({ ...f, [key]: nextValue }));
  };

  useEffect(() => {
    initDatabase().catch(e => Alert.alert('Erro SQLite', e.message));
  }, []);

  useEffect(() => {
    if (!isRecording) return;
    const interval = setInterval(() => {
      setRecordSeconds(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isRecording]);

  useEffect(() => {
    if (isRecording && recordSeconds >= MAX_AUDIO_SECONDS) {
      stopRecording();
      Alert.alert('Limite atingido', 'A gravação atingiu o tempo máximo de 01:30 e foi salva.');
    }
  }, [isRecording, recordSeconds]);

  async function startRecording() {
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permissão necessária', 'Autorize o acesso ao microfone para gravar a descrição em áudio.');
        return;
      }

      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true
      });

      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();

      setRecordSeconds(0);
      setIsRecording(true);
    } catch (e) {
      Alert.alert('Erro ao gravar', e.message || 'Não foi possível iniciar o microfone.');
    }
  }

  async function stopRecording() {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    try {
      await audioRecorder.stop();
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: false
      });

      const uri = audioRecorder.uri;
      if (uri) {
        setForm(f => ({
          ...f,
          audioUri: uri,
          audioDuration: Math.max(1, Math.min(recordSeconds, MAX_AUDIO_SECONDS))
        }));
      }
    } catch (e) {
      Alert.alert('Erro ao finalizar áudio', e.message);
    } finally {
      setIsRecording(false);
      stoppingRef.current = false;
    }
  }

  function removeAudio() {
    setForm(f => ({ ...f, audioUri: '', audioDuration: 0 }));
    setRecordSeconds(0);
  }

  useEffect(() => {
    let active = true;
    (async () => {
      const isoDate = brDateToIso(form.data.trim());
      if (!isoDate) {
        if (active) setOccupiedTimes([]);
        return;
      }
      try {
        const occupied = await getOccupiedTimesByDate(isoDate);
        if (active) {
          setOccupiedTimes(occupied);
          setForm(prev => {
            if (occupied.includes(prev.hora)) {
              const firstFree = times.find(t => !occupied.includes(t));
              return firstFree ? { ...prev, hora: firstFree } : prev;
            }
            return prev;
          });
        }
      } catch {
        if (active) setOccupiedTimes([]);
      }
    })();
    return () => { active = false; };
  }, [form.data]);

  const loadAdminData = useCallback(async () => {
    if (!adminUser) {
      setBookings([]);
      setReminders([]);
      return;
    }
    try {
      const data = await syncAndGetAdminDashboard();
      setBookings(data.bookings);
      setReminders(data.reminders);
    } catch (e) {
      Alert.alert('Erro ao carregar dados', e.message);
    }
  }, [adminUser]);

  useEffect(() => {
    if (page === 'admin' && adminUser) {
      loadAdminData();
    }
  }, [page, adminUser, loadAdminData]);

  async function book() {
    if (isRecording) {
      Alert.alert('Gravação em andamento', 'Pare a gravação do áudio antes de confirmar o agendamento.');
      return;
    }
    if (!form.nome.trim()) {
      Alert.alert('Dados incompletos', 'Informe seu nome completo.');
      return;
    }
    const phone = normalizePhone(form.whatsapp);
    if (!/^55\d{10,11}$/.test(phone)) {
      Alert.alert('WhatsApp inválido', 'Informe DDD + número com 10 ou 11 dígitos (ex.: (21) 99999-9999).');
      return;
    }
    const isoDate = brDateToIso(form.data.trim());
    const startMs = parseLocalDateTime(isoDate, form.hora);
    if (!isoDate || !startMs || startMs < Date.now() + 2 * 3600000) {
      Alert.alert('Data ou horário inválido', 'Informe uma data válida no formato DD/MM/AAAA com pelo menos 2 horas de antecedência.');
      return;
    }
    if (occupiedTimes.includes(form.hora)) {
      Alert.alert('Horário ocupado', 'Todos os horários desta data já estão reservados ou este bloco está indisponível.');
      return;
    }
    if (!form.consent) {
      Alert.alert('Consentimento', 'Autorize o contato relacionado ao agendamento.');
      return;
    }

    const cleanSize = digits(form.tamanho);

    setBusy(true);
    try {
      const { protocolo } = await createBookingWithReminders({
        nome: form.nome.trim(),
        whatsapp: phone,
        data: isoDate,
        hora: form.hora,
        estilo: form.estilo,
        regiao: form.regiao,
        tamanho: cleanSize ? `${cleanSize} cm` : '',
        ideia: form.ideia.trim(),
        audioUri: form.audioUri || null,
        audioDuration: form.audioDuration || 0,
        startMs
      });

      Alert.alert('Confirmado!', `Seu horário foi reservado para ${form.data} às ${form.hora}.\nProtocolo: ${protocolo}`);
      setForm({
        nome: '', whatsapp: '', data: '', hora: '10:00',
        estilo: stylesTattoo[0], regiao: regions[0], tamanho: '',
        ideia: '', audioUri: '', audioDuration: 0, consent: false
      });
      setRecordSeconds(0);
      setPage('home');
    } catch (e) {
      Alert.alert('Não foi possível reservar', e.message || 'Tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  async function login() {
    setBusy(true);
    try {
      const admin = await authenticateAdmin(email, password);
      if (!admin) {
        Alert.alert('Acesso negado', 'Confira e-mail e senha.');
        return;
      }
      setAdminUser(admin);
      setPassword('');
      setPage('admin');
    } catch (e) {
      Alert.alert('Erro no login', e.message);
    } finally {
      setBusy(false);
    }
  }

  function openWhatsApp(number, message) {
    const phone = normalizePhone(number);
    if (!/^55\d{10,11}$/.test(phone)) {
      Alert.alert('Número inválido', 'Use o telefone com código do Brasil: 55 + DDD + número.');
      return;
    }
    Linking.openURL(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`)
      .catch(() => Alert.alert('WhatsApp', 'Não foi possível abrir o link.'));
  }

  async function shareAudioFile(uri) {
    try {
      if (!uri) {
        Alert.alert('Áudio indisponível', 'Nenhum arquivo de áudio encontrado neste agendamento.');
        return;
      }
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Indisponível', 'O compartilhamento de arquivos não está disponível neste dispositivo.');
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: 'audio/mp4',
        dialogTitle: 'Enviar áudio da tatuagem no WhatsApp'
      });
    } catch (e) {
      Alert.alert('Erro ao compartilhar', e.message || 'Não foi possível enviar o arquivo de áudio.');
    }
  }

  async function cancel(id) {
    Alert.alert('Cancelar agendamento?', 'O horário será liberado e os lembretes serão cancelados.', [
      { text: 'Voltar', style: 'cancel' },
      {
        text: 'Cancelar horário',
        style: 'destructive',
        onPress: async () => {
          try {
            await cancelBookingById(id);
            await loadAdminData();
          } catch (e) {
            Alert.alert('Erro', e.message);
          }
        }
      }
    ]);
  }

  async function sent(id) {
    try {
      await markReminderAsSent(id);
      await loadAdminData();
    } catch (e) {
      Alert.alert('Erro', e.message);
    }
  }

  const button = (label, onPress, disabled = false) => (
    <TouchableOpacity disabled={disabled} style={[s.button, disabled && { opacity: 0.5 }]} onPress={onPress}>
      <Text style={s.buttonText}>{label}</Text>
    </TouchableOpacity>
  );

  const field = (label, key, placeholder, keyboardType = 'default', maxLength = undefined) => (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        style={s.input}
        placeholder={placeholder}
        placeholderTextColor="#666"
        value={form[key]}
        onChangeText={v => update(key, v)}
        keyboardType={keyboardType}
        maxLength={maxLength}
      />
    </View>
  );

  const choices = (label, key, options, blocked = []) => (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <View style={s.wrap}>
        {options.map(x => {
          const isBlocked = blocked.includes(x);
          const isSelected = form[key] === x && !isBlocked;
          return (
            <TouchableOpacity
              key={x}
              disabled={isBlocked}
              onPress={() => update(key, x)}
              style={[s.choice, isSelected && s.selected, isBlocked && s.blocked]}
            >
              <Text style={{ color: isBlocked ? '#666' : isSelected ? '#000' : '#ddd' }}>
                {isBlocked ? `${x} (OCUPADO)` : x}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#090909" />
      <View style={s.header}>
        <Text style={s.logo}>VP  STUDIO</Text>
        <TouchableOpacity onPress={() => setPage(adminUser ? 'admin' : 'login')}>
          <Text style={s.small}>ÁREA DA VITORIA</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {page === 'home' && (
          <>
            <Text style={s.eyebrow}>TATTOO STUDIO</Text>
            <Text style={s.hero}>VITORIA{'\n'}PINHEIRO</Text>
            <Text style={s.muted}>Arte, identidade e expressão. Sua pele é a tela.</Text>
            <View style={s.card}>
              <Text style={s.title}>Vitoria Pinheiro Vieira</Text>
              <Text style={s.muted}>Escolha um horário livre e receba confirmação na tela.</Text>
            </View>
            {button('AGENDAR TATUAGEM', () => setPage('booking'))}
          </>
        )}

        {page === 'booking' && (
          <>
            <Text style={s.eyebrow}>01 / BOOKING</Text>
            <Text style={s.title}>AGENDAMENTO</Text>
            {field('NOME COMPLETO', 'nome', 'Seu nome')}
            {field('WHATSAPP (DDD + NÚMERO)', 'whatsapp', '(21) 99999-9999', 'phone-pad', 15)}
            {choices('ESTILO', 'estilo', stylesTattoo)}
            {choices('REGIÃO', 'regiao', regions)}
            {field('TAMANHO APROXIMADO (CM)', 'tamanho', 'Ex.: 10', 'number-pad', 3)}

            <View style={s.field}>
              <Text style={s.label}>DESCRIÇÃO (DIGITE OU GRAVE UM ÁUDIO DE ATÉ 01:30)</Text>
              <TextInput
                style={[s.input, { minHeight: 80, textAlignVertical: 'top' }]}
                placeholder="Conte sua ideia por escrito..."
                placeholderTextColor="#666"
                value={form.ideia}
                onChangeText={v => update('ideia', v)}
                multiline
              />

              <View style={s.audioBox}>
                {isRecording ? (
                  <>
                    <Text style={s.recordingText}>
                      🔴  GRAVANDO ÁUDIO...  {formatSeconds(recordSeconds)} / 01:30
                    </Text>
                    <TouchableOpacity style={s.stopBtn} onPress={stopRecording}>
                      <Text style={s.stopBtnText}>⏹️  PARAR E SALVAR ÁUDIO</Text>
                    </TouchableOpacity>
                  </>
                ) : form.audioUri ? (
                  <>
                    <Text style={s.muted}>Áudio anexado ao agendamento:</Text>
                    <AudioPreview uri={form.audioUri} duration={form.audioDuration} />
                    <TouchableOpacity style={s.deleteAudioBtn} onPress={removeAudio}>
                      <Text style={s.deleteAudioText}>🗑️  APAGAR E GRAVAR OUTRO</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity style={s.recordBtn} onPress={startRecording}>
                    <Text style={s.recordBtnText}>🎙️  GRAVAR ÁUDIO DA IDEIA (MÁX. 01:30)</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {field('DATA (DD/MM/AAAA)', 'data', '20/12/2026', 'number-pad', 10)}
            {choices('HORÁRIO — BLOCO DE 3 HORAS', 'hora', times, occupiedTimes)}
            <TouchableOpacity onPress={() => update('consent', !form.consent)} style={s.consent}>
              <Text style={s.muted}>
                {form.consent ? '☑' : '☐'} Autorizo o uso dos dados para o agendamento e o contato sobre a sessão. Entendo que o WhatsApp pessoal exige envio manual.
              </Text>
            </TouchableOpacity>
            {button(busy ? 'RESERVANDO...' : 'CONFIRMAR HORÁRIO', book, busy)}
          </>
        )}

        {page === 'login' && (
          <>
            <Text style={s.eyebrow}>ÁREA RESTRITA</Text>
            <Text style={s.title}>ACESSO DA VITORIA</Text>
            <TextInput
              style={[s.input, { marginTop: 20 }]}
              value={email}
              onChangeText={setEmail}
              placeholder="E-mail (vitoria@vpstudio.com)"
              placeholderTextColor="#777"
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TextInput
              style={[s.input, { marginTop: 12 }]}
              value={password}
              onChangeText={setPassword}
              placeholder="Senha (123456)"
              placeholderTextColor="#777"
              secureTextEntry
            />
            {button('ENTRAR', login, busy)}
          </>
        )}

        {page === 'admin' && (
          <>
            <Text style={s.eyebrow}>PAINEL PRIVADO</Text>
            <Text style={s.title}>ADMINISTRAÇÃO</Text>
            {!adminUser ? (
              <Text style={s.muted}>Entre com sua conta de administradora.</Text>
            ) : (
              <>
                <Text style={s.section}>LEMBRETES PRONTOS PARA ENVIO MANUAL</Text>
                {reminders.filter(r => r.status === 'pending').length === 0 && (
                  <Text style={s.muted}>Nenhum lembrete pendente no momento.</Text>
                )}
                {reminders.filter(r => r.status === 'pending').map(r => {
                  const b = bookings.find(x => x.id === r.booking_id);
                  if (!b || b.status !== 'confirmed') return null;
                  const dataFormatada = isoToBrDate(b.data);
                  const msg = `Olá, ${b.nome}! Aqui é a Vitoria, do Vitoria Pinheiro Studio. Lembrando sua tatuagem em ${dataFormatada} às ${b.hora} (${r.kind === '24h' ? 'faltam cerca de 24 horas' : 'faltam cerca de 2 horas'}). Até lá!`;
                  return (
                    <View key={r.id} style={s.card}>
                      <Text style={s.title}>{r.kind === '24h' ? 'LEMBRETE 24H' : 'LEMBRETE 2H'}</Text>
                      <Text style={s.muted}>{b.nome} • {dataFormatada} {b.hora}</Text>
                      {button('ABRIR MENSAGEM NO WHATSAPP', () => openWhatsApp(b.whatsapp, msg))}
                      {button('MARCAR COMO ENVIADO', () => sent(r.id))}
                    </View>
                  );
                })}

                <Text style={s.section}>AGENDAMENTOS ({bookings.length})</Text>
                {bookings.length === 0 && <Text style={s.muted}>Nenhum agendamento registrado no SQLite.</Text>}
                {bookings.map(b => {
                  const dataFormatada = isoToBrDate(b.data);
                  const detalhesIdeia = [
                    b.ideia ? b.ideia : null,
                    b.audio_uri ? `Áudio anexado (${formatSeconds(b.audio_duration)})` : null
                  ].filter(Boolean).join(' + ');

                  const msgConfirmacao =
                    `Olá, *${b.nome}*! Tudo bem? Aqui é a *Vitoria*, do *VP Studio* 🖤\n\n` +
                    `Estou passando por aqui para te enviar a *confirmação do seu agendamento*! Confira os detalhes da sua sessão:\n\n` +
                    `• *Protocolo:* ${b.protocolo}\n` +
                    `• *Data e Horário:* ${dataFormatada} às ${b.hora}\n` +
                    `• *Projeto:* ${b.estilo} — ${b.regiao}${b.tamanho ? ` (${b.tamanho})` : ''}${detalhesIdeia ? `\n• *Ideia:* ${detalhesIdeia}` : ''}\n\n` +
                    `Seu horário já está garantido na agenda. Qualquer dúvida ou orientação antes da sessão, é só me chamar por aqui!`;

                  const msgCancelamento =
                    `Olá, ${b.nome}! Aqui é a *Vitoria*, do *VP Studio*.\n\n` +
                    `Informo que seu agendamento (${b.protocolo}), previsto para *${dataFormatada} às ${b.hora}*, foi cancelado.\n` +
                    `Se quiser remarcar uma nova data, estou à disposição!`;

                  return (
                    <View key={b.id} style={s.card}>
                      <Text style={s.title}>{b.nome}</Text>
                      <Text style={s.muted}>Protocolo: {b.protocolo}</Text>
                      <Text style={s.muted}>{dataFormatada} às {b.hora} • {b.estilo} • {b.regiao}</Text>
                      {!!b.ideia && <Text style={s.muted}>Descrição: {b.ideia}</Text>}
                      {!!b.audio_uri && (
                        <>
                          <AudioPreview uri={b.audio_uri} duration={b.audio_duration} />
                          <TouchableOpacity style={s.shareAudioBtn} onPress={() => shareAudioFile(b.audio_uri)}>
                            <Text style={s.shareAudioText}>📤  ENVIAR ÁUDIO NO WHATSAPP</Text>
                          </TouchableOpacity>
                        </>
                      )}
                      <Text style={s.muted}>Status: {b.status}</Text>
                      {button('ABRIR MENSAGEM NO WHATSAPP', () =>
                        openWhatsApp(b.whatsapp, b.status === 'confirmed' ? msgConfirmacao : msgCancelamento)
                      )}
                      {b.status === 'confirmed' && button('CANCELAR AGENDAMENTO', () => cancel(b.id))}
                    </View>
                  );
                })}
              </>
            )}
            {adminUser && button('SAIR DA CONTA', () => { setAdminUser(null); setPage('home'); })}
          </>
        )}
      </ScrollView>

      <View style={s.nav}>
        {[['home', 'INÍCIO'], ['booking', 'AGENDAR'], [adminUser ? 'admin' : 'login', 'ADMIN']].map(([id, label]) => (
          <TouchableOpacity key={id} onPress={() => setPage(id)}>
            <Text style={s.navText}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  header: { height: 62, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: palette.line },
  logo: { color: '#fff', fontSize: 17, fontWeight: '900', letterSpacing: 2 },
  small: { color: '#bbb', fontSize: 10 },
  content: { padding: 22, paddingBottom: 50 },
  eyebrow: { color: '#aaa', fontSize: 10, letterSpacing: 3, marginTop: 25 },
  hero: { color: '#fff', fontSize: 46, fontWeight: '900', lineHeight: 49, marginTop: 24 },
  title: { color: '#fff', fontSize: 23, fontWeight: 'bold', marginTop: 14 },
  muted: { color: palette.muted, fontSize: 13, lineHeight: 21, marginTop: 12 },
  card: { backgroundColor: palette.card, borderWidth: 1, borderColor: palette.line, padding: 18, marginTop: 16 },
  button: { backgroundColor: '#fff', padding: 17, alignItems: 'center', marginTop: 16 },
  buttonText: { color: '#000', fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  field: { marginTop: 19 },
  label: { color: '#ccc', fontSize: 10, letterSpacing: 1.5, marginBottom: 10 },
  input: { backgroundColor: palette.card, color: '#fff', borderWidth: 1, borderColor: palette.line, padding: 15 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { padding: 12, borderWidth: 1, borderColor: '#444' },
  selected: { backgroundColor: '#fff', borderColor: '#fff' },
  blocked: { borderColor: '#222', backgroundColor: '#111' },
  consent: { marginTop: 16 },
  section: { color: '#fff', fontWeight: 'bold', fontSize: 12, letterSpacing: 1.5, marginTop: 32 },
  nav: { height: 60, backgroundColor: '#111', borderTopWidth: 1, borderColor: palette.line, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  navText: { color: '#ddd', fontSize: 10, letterSpacing: 1 },
  audioBox: { backgroundColor: '#121212', borderWidth: 1, borderColor: '#333', padding: 14, marginTop: 10 },
  recordBtn: { borderWidth: 1, borderColor: '#fff', padding: 14, alignItems: 'center' },
  recordBtnText: { color: '#fff', fontSize: 11, fontWeight: 'bold', letterSpacing: 1 },
  recordingText: { color: '#ff5252', fontSize: 12, fontWeight: 'bold', textAlign: 'center', marginBottom: 10 },
  stopBtn: { backgroundColor: '#ff5252', padding: 14, alignItems: 'center' },
  stopBtnText: { color: '#fff', fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  audioPlayBtn: { backgroundColor: '#242424', borderWidth: 1, borderColor: '#555', padding: 13, alignItems: 'center', marginTop: 10 },
  audioPlayText: { color: '#fff', fontSize: 11, fontWeight: 'bold', letterSpacing: 1 },
  shareAudioBtn: { backgroundColor: '#1b3a2b', borderWidth: 1, borderColor: '#2e7d57', padding: 13, alignItems: 'center', marginTop: 8 },
  shareAudioText: { color: '#a8f0c6', fontSize: 11, fontWeight: 'bold', letterSpacing: 1 },
  deleteAudioBtn: { padding: 10, alignItems: 'center', marginTop: 8 },
  deleteAudioText: { color: '#ff6b6b', fontSize: 10, letterSpacing: 1 }
});