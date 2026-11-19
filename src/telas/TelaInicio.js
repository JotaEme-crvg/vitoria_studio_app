import React from 'react';
import { View, Text } from 'react-native';
import { BotaoPadrao } from '../componentes/ControlesFormulario';
import { s } from '../estilos/tema';

// tela inicial do estúdio
export default function TelaInicio({ aoIrParaAgendar }) {
  return (
    <>
      <Text style={s.eyebrow}>TATTOO STUDIO</Text>
      <Text style={s.hero}>VITORIA{'\n'}PINHEIRO</Text>
      <Text style={s.muted}>Arte, identidade e expressão. Sua pele é a tela.</Text>
      <View style={s.card}>
        <Text style={s.title}>Vitoria Pinheiro Vieira</Text>
        <Text style={s.muted}>Escolha um horário livre e receba confirmação na tela.</Text>
      </View>
      <BotaoPadrao texto="AGENDAR TATUAGEM" aoPressionar={aoIrParaAgendar} />
    </>
  );
}