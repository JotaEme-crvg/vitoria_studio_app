import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, Alert, Linking } from 'react-native';
import * as Sharing from 'expo-sharing';
import {
  syncAndGetAdminDashboard,
  cancelBookingById,
  markReminderAsSent
} from '../database/bookingRepository';
import PlayerAudio from '../componentes/PlayerAudio';
import { BotaoPadrao } from '../componentes/ControlesFormulario';
import { formatarSegundos, dataIsoParaBr, normalizarTelefone } from '../utilitarios/formatadores';
import { s } from '../estilos/tema';

// painel administrativo da Vitória com agendamentos, lembretes e envio no WhatsApp
export default function TelaAdmin({ adminLogado, aoSair }) {
  const [agendamentos, setAgendamentos] = useState([]);
  const [lembretes, setLembretes] = useState([]);

  // puxa do SQLite os agendamentos e lembretes pro painel da Vitória
  const carregarDadosAdmin = useCallback(async () => {
    if (!adminLogado) {
      setAgendamentos([]);
      setLembretes([]);
      return;
    }
    try {
      const dados = await syncAndGetAdminDashboard();
      setAgendamentos(dados.bookings);
      setLembretes(dados.reminders);
    } catch (e) {
      Alert.alert('Erro ao carregar dados', e.message);
    }
  }, [adminLogado]);

  useEffect(() => {
    if (adminLogado) {
      carregarDadosAdmin();
    }
  }, [adminLogado, carregarDadosAdmin]);

  // monta o link wa.me com o texto pronto e abre direto no zap do cliente
  function abrirWhatsApp(numero, mensagem) {
    const telefone = normalizarTelefone(numero);
    if (!/^55\d{10,11}$/.test(telefone)) {
      Alert.alert('Número inválido', 'Use o telefone com código do Brasil: 55 + DDD + número.');
      return;
    }
    Linking.openURL(`https://wa.me/${telefone}?text=${encodeURIComponent(mensagem)}`)
      .catch(() => Alert.alert('WhatsApp', 'Não foi possível abrir o link.'));
  }

  // abre o menu de compartilhamento do celular pra mandar o arquivo de áudio no zap
  async function compartilharAudio(uri) {
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

  // pede confirmação, cancela o agendamento no banco e libera o horário
  async function cancelar(id) {
    Alert.alert('Cancelar agendamento?', 'O horário será liberado e os lembretes serão cancelados.', [
      { text: 'Voltar', style: 'cancel' },
      {
        text: 'Cancelar horário',
        style: 'destructive',
        onPress: async () => {
          try {
            await cancelBookingById(id);
            await carregarDadosAdmin();
          } catch (e) {
            Alert.alert('Erro', e.message);
          }
        }
      }
    ]);
  }

  // marca o lembrete como enviado pra sair da lista de pendentes
  async function marcarEnviado(id) {
    try {
      await markReminderAsSent(id);
      await carregarDadosAdmin();
    } catch (e) {
      Alert.alert('Erro', e.message);
    }
  }

  return (
    <>
      <Text style={s.eyebrow}>PAINEL PRIVADO</Text>
      <Text style={s.title}>ADMINISTRAÇÃO</Text>
      {!adminLogado ? (
        <Text style={s.muted}>Entre com sua conta de administradora.</Text>
      ) : (
        <>
          <Text style={s.section}>LEMBRETES PRONTOS PARA ENVIO MANUAL</Text>
          {lembretes.filter(r => r.status === 'pending').length === 0 && (
            <Text style={s.muted}>Nenhum lembrete pendente no momento.</Text>
          )}
          {lembretes.filter(r => r.status === 'pending').map(r => {
            const b = agendamentos.find(x => x.id === r.booking_id);
            if (!b || b.status !== 'confirmed') return null;
            const dataFormatada = dataIsoParaBr(b.data);
            const msg = `Olá, ${b.nome}! Aqui é a Vitoria, do Vitoria Pinheiro Studio. Lembrando sua tatuagem em ${dataFormatada} às ${b.hora} (${r.kind === '24h' ? 'faltam cerca de 24 horas' : 'faltam cerca de 2 horas'}). Até lá!`;
            return (
              <View key={r.id} style={s.card}>
                <Text style={s.title}>{r.kind === '24h' ? 'LEMBRETE 24H' : 'LEMBRETE 2H'}</Text>
                <Text style={s.muted}>{b.nome} • {dataFormatada} {b.hora}</Text>
                <BotaoPadrao texto="ABRIR MENSAGEM NO WHATSAPP" aoPressionar={() => abrirWhatsApp(b.whatsapp, msg)} />
                <BotaoPadrao texto="MARCAR COMO ENVIADO" aoPressionar={() => marcarEnviado(r.id)} />
              </View>
            );
          })}

          <Text style={s.section}>AGENDAMENTOS ({agendamentos.length})</Text>
          {agendamentos.length === 0 && <Text style={s.muted}>Nenhum agendamento registrado no SQLite.</Text>}
          {agendamentos.map(b => {
            const dataFormatada = dataIsoParaBr(b.data);
            const detalhesIdeia = [
              b.ideia ? b.ideia : null,
              b.audio_uri ? `Áudio anexado (${formatarSegundos(b.audio_duration)})` : null
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
                    <PlayerAudio uri={b.audio_uri} duracao={b.audio_duration} />
                    <TouchableOpacity style={s.shareAudioBtn} onPress={() => compartilharAudio(b.audio_uri)}>
                      <Text style={s.shareAudioText}>📤  ENVIAR ÁUDIO NO WHATSAPP</Text>
                    </TouchableOpacity>
                  </>
                )}
                <Text style={s.muted}>Status: {b.status}</Text>
                <BotaoPadrao
                  texto="ABRIR MENSAGEM NO WHATSAPP"
                  aoPressionar={() => abrirWhatsApp(b.whatsapp, b.status === 'confirmed' ? msgConfirmacao : msgCancelamento)}
                />
                {b.status === 'confirmed' && (
                  <BotaoPadrao texto="CANCELAR AGENDAMENTO" aoPressionar={() => cancelar(b.id)} />
                )}
              </View>
            );
          })}
        </>
      )}
      {adminLogado && <BotaoPadrao texto="SAIR DA CONTA" aoPressionar={aoSair} />}
    </>
  );
}