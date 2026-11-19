import React from 'react';
import { TouchableOpacity, Text } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { formatarSegundos } from '../utilitarios/formatadores';
import { s } from '../estilos/tema';

// mini player q aparece na tela pro cliente ou a Vitória ouvirem o áudio
export default function PlayerAudio({ uri, duracao }) {
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);

  // dá play, pausa ou reinicia o áudio quando clica no botão
  const alternarPlay = () => {
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
    <TouchableOpacity style={s.audioPlayBtn} onPress={alternarPlay}>
      <Text style={s.audioPlayText}>
        {status.playing ? '⏸️  PAUSAR ÁUDIO' : `▶️  OUVIR ÁUDIO (${formatarSegundos(duracao)})`}
      </Text>
    </TouchableOpacity>
  );
}