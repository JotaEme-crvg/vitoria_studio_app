import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert } from 'react-native';
import {
  useAudioRecorder,
  AudioModule,
  RecordingPresets,
  setAudioModeAsync
} from 'expo-audio';
import { getOccupiedTimesByDate, createBookingWithReminders } from '../database/bookingRepository';
import PlayerAudio from '../componentes/PlayerAudio';
import { BotaoPadrao, CampoTexto, GrupoEscolha } from '../componentes/ControlesFormulario';
import {
  MAX_SEGUNDOS_AUDIO,
  horarios,
  estilosTattoo,
  regioes,
  apenasDigitos,
  formatarSegundos,
  mascaraTelefone,
  mascaraData,
  dataBrParaIso,
  normalizarTelefone,
  dataHoraParaMs
} from '../utilitarios/formatadores';
import { s } from '../estilos/tema';

// tela de agendamento do cliente com gravação de áudio e validação de horários
export default function TelaAgendamento({ aoConcluirAgendamento }) {
  const [horariosOcupados, setHorariosOcupados] = useState([]);
  const [ocupado, setOcupado] = useState(false);

  const gravadorAudio = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [gravando, setGravando] = useState(false);
  const [segundosGravados, setSegundosGravados] = useState(0);
  const parandoRef = useRef(false);

  const [form, setForm] = useState({
    nome: '', whatsapp: '', data: '', hora: '10:00',
    estilo: estilosTattoo[0], regiao: regioes[0], tamanho: '',
    ideia: '', audioUri: '', audioDuration: 0, consent: false
  });

  // atualiza os campos do formulário já aplicando as máscaras na hora
  const atualizar = (chave, valor) => {
    let proximoValor = valor;
    if (chave === 'whatsapp') proximoValor = mascaraTelefone(valor);
    if (chave === 'data') proximoValor = mascaraData(valor);
    if (chave === 'tamanho') proximoValor = apenasDigitos(valor).slice(0, 3);
    setForm(f => ({ ...f, [chave]: proximoValor }));
  };

  useEffect(() => {
    if (!gravando) return;
    const interval = setInterval(() => {
      setSegundosGravados(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [gravando]);

  useEffect(() => {
    if (gravando && segundosGravados >= MAX_SEGUNDOS_AUDIO) {
      pararGravacao();
      Alert.alert('Limite atingido', 'A gravação atingiu o tempo máximo de 01:30 e foi salva.');
    }
  }, [gravando, segundosGravados]);

  // pede permissão do microfone e começa a gravar a ideia em áudio
  async function iniciarGravacao() {
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

      await gravadorAudio.prepareToRecordAsync();
      gravadorAudio.record();

      setSegundosGravados(0);
      setGravando(true);
    } catch (e) {
      Alert.alert('Erro ao gravar', e.message || 'Não foi possível iniciar o microfone.');
    }
  }

  // para a gravação, solta o microfone e salva o áudio no formulário
  async function pararGravacao() {
    if (parandoRef.current) return;
    parandoRef.current = true;
    try {
      await gravadorAudio.stop();
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: false
      });

      const uri = gravadorAudio.uri;
      if (uri) {
        setForm(f => ({
          ...f,
          audioUri: uri,
          audioDuration: Math.max(1, Math.min(segundosGravados, MAX_SEGUNDOS_AUDIO))
        }));
      }
    } catch (e) {
      Alert.alert('Erro ao finalizar áudio', e.message);
    } finally {
      setGravando(false);
      parandoRef.current = false;
    }
  }

  // apaga o áudio gravado se o cliente quiser gravar outro
  function removerAudio() {
    setForm(f => ({ ...f, audioUri: '', audioDuration: 0 }));
    setSegundosGravados(0);
  }

  useEffect(() => {
    let ativo = true;
    (async () => {
      const dataIso = dataBrParaIso(form.data.trim());
      if (!dataIso) {
        if (ativo) setHorariosOcupados([]);
        return;
      }
      try {
        const occupied = await getOccupiedTimesByDate(dataIso);
        if (ativo) {
          setHorariosOcupados(occupied);
          setForm(prev => {
            if (occupied.includes(prev.hora)) {
              const primeiroLivre = horarios.find(t => !occupied.includes(t));
              return primeiroLivre ? { ...prev, hora: primeiroLivre } : prev;
            }
            return prev;
          });
        }
      } catch {
        if (ativo) setHorariosOcupados([]);
      }
    })();
    return () => { ativo = false; };
  }, [form.data]);

  // valida os dados, checa horário livre, salva no SQLite e gera o protocolo
  async function agendar() {
    if (gravando) {
      Alert.alert('Gravação em andamento', 'Pare a gravação do áudio antes de confirmar o agendamento.');
      return;
    }
    if (!form.nome.trim()) {
      Alert.alert('Dados incompletos', 'Informe seu nome completo.');
      return;
    }
    const telefone = normalizarTelefone(form.whatsapp);
    if (!/^55\d{10,11}$/.test(telefone)) {
      Alert.alert('WhatsApp inválido', 'Informe DDD + número com 10 ou 11 dígitos (ex.: (21) 99999-9999).');
      return;
    }
    const dataIso = dataBrParaIso(form.data.trim());
    const inicioMs = dataHoraParaMs(dataIso, form.hora);
    if (!dataIso || !inicioMs || inicioMs < Date.now() + 2 * 3600000) {
      Alert.alert('Data ou horário inválido', 'Informe uma data válida no formato DD/MM/AAAA com pelo menos 2 horas de antecedência.');
      return;
    }
    if (horariosOcupados.includes(form.hora)) {
      Alert.alert('Horário ocupado', 'Todos os horários desta data já estão reservados ou este bloco está indisponível.');
      return;
    }
    if (!form.consent) {
      Alert.alert('Consentimento', 'Autorize o contato relacionado ao agendamento.');
      return;
    }

    const tamanhoLimpo = apenasDigitos(form.tamanho);

    setOcupado(true);
    try {
      const { protocolo } = await createBookingWithReminders({
        nome: form.nome.trim(),
        whatsapp: telefone,
        data: dataIso,
        hora: form.hora,
        estilo: form.estilo,
        regiao: form.regiao,
        tamanho: tamanhoLimpo ? `${tamanhoLimpo} cm` : '',
        ideia: form.ideia.trim(),
        audioUri: form.audioUri || null,
        audioDuration: form.audioDuration || 0,
        startMs: inicioMs
      });

      Alert.alert('Confirmado!', `Seu horário foi reservado para ${form.data} às ${form.hora}.\nProtocolo: ${protocolo}`);
      setForm({
        nome: '', whatsapp: '', data: '', hora: '10:00',
        estilo: estilosTattoo[0], regiao: regioes[0], tamanho: '',
        ideia: '', audioUri: '', audioDuration: 0, consent: false
      });
      setSegundosGravados(0);
      aoConcluirAgendamento();
    } catch (e) {
      Alert.alert('Não foi possível reservar', e.message || 'Tente novamente.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <>
      <Text style={s.eyebrow}>01 / BOOKING</Text>
      <Text style={s.title}>AGENDAMENTO</Text>
      <CampoTexto titulo="NOME COMPLETO" valor={form.nome} aoMudarTexto={v => atualizar('nome', v)} placeholder="Seu nome" />
      <CampoTexto titulo="WHATSAPP (DDD + NÚMERO)" valor={form.whatsapp} aoMudarTexto={v => atualizar('whatsapp', v)} placeholder="(21) 99999-9999" tipoTeclado="phone-pad" tamanhoMaximo={15} />
      <GrupoEscolha titulo="ESTILO" opcoes={estilosTattoo} valorSelecionado={form.estilo} aoSelecionar={v => atualizar('estilo', v)} />
      <GrupoEscolha titulo="REGIÃO" opcoes={regioes} valorSelecionado={form.regiao} aoSelecionar={v => atualizar('regiao', v)} />
      <CampoTexto titulo="TAMANHO APROXIMADO (CM)" valor={form.tamanho} aoMudarTexto={v => atualizar('tamanho', v)} placeholder="Ex.: 10" tipoTeclado="number-pad" tamanhoMaximo={3} />

      <View style={s.field}>
        <Text style={s.label}>DESCRIÇÃO (DIGITE OU GRAVE UM ÁUDIO DE ATÉ 01:30)</Text>
        <TextInput
          style={[s.input, { minHeight: 80, textAlignVertical: 'top' }]}
          placeholder="Conte sua ideia por escrito..."
          placeholderTextColor="#666"
          value={form.ideia}
          onChangeText={v => atualizar('ideia', v)}
          multiline
        />

        <View style={s.audioBox}>
          {gravando ? (
            <>
              <Text style={s.recordingText}>
                🔴  GRAVANDO ÁUDIO...  {formatarSegundos(segundosGravados)} / 01:30
              </Text>
              <TouchableOpacity style={s.stopBtn} onPress={pararGravacao}>
                <Text style={s.stopBtnText}>⏹️  PARAR E SALVAR ÁUDIO</Text>
              </TouchableOpacity>
            </>
          ) : form.audioUri ? (
            <>
              <Text style={s.muted}>Áudio anexado ao agendamento:</Text>
              <PlayerAudio uri={form.audioUri} duracao={form.audioDuration} />
              <TouchableOpacity style={s.deleteAudioBtn} onPress={removerAudio}>
                <Text style={s.deleteAudioText}>🗑️  APAGAR E GRAVAR OUTRO</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity style={s.recordBtn} onPress={iniciarGravacao}>
              <Text style={s.recordBtnText}>🎙️  GRAVAR ÁUDIO DA IDEIA (MÁX. 01:30)</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <CampoTexto titulo="DATA (DD/MM/AAAA)" valor={form.data} aoMudarTexto={v => atualizar('data', v)} placeholder="20/12/2026" tipoTeclado="number-pad" tamanhoMaximo={10} />
      <GrupoEscolha titulo="HORÁRIO — BLOCO DE 3 HORAS" opcoes={horarios} valorSelecionado={form.hora} aoSelecionar={v => atualizar('hora', v)} bloqueados={horariosOcupados} />

      <TouchableOpacity onPress={() => atualizar('consent', !form.consent)} style={s.consent}>
        <Text style={s.muted}>
          {form.consent ? '☑' : '☐'} Autorizo o uso dos dados para o agendamento e o contato sobre a sessão. Entendo que o WhatsApp pessoal exige envio manual.
        </Text>
      </TouchableOpacity>
      <BotaoPadrao texto={ocupado ? 'RESERVANDO...' : 'CONFIRMAR HORÁRIO'} aoPressionar={agendar} desabilitado={ocupado} />
    </>
  );
}