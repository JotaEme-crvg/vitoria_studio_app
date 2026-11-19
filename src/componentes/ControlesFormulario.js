import React from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { s } from '../estilos/tema';

// cria o botão branco padrão do app pra não repetir código
export function BotaoPadrao({ texto, aoPressionar, desabilitado = false }) {
  return (
    <TouchableOpacity disabled={desabilitado} style={[s.button, desabilitado && { opacity: 0.5 }]} onPress={aoPressionar}>
      <Text style={s.buttonText}>{texto}</Text>
    </TouchableOpacity>
  );
}

// monta cada caixinha de texto do formulário
export function CampoTexto({ titulo, valor, aoMudarTexto, placeholder, tipoTeclado = 'default', tamanhoMaximo = undefined }) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{titulo}</Text>
      <TextInput
        style={s.input}
        placeholder={placeholder}
        placeholderTextColor="#666"
        value={valor}
        onChangeText={aoMudarTexto}
        keyboardType={tipoTeclado}
        maxLength={tamanhoMaximo}
      />
    </View>
  );
}

// monta os botões de escolha (estilo, região e horários) e trava os ocupados
export function GrupoEscolha({ titulo, opcoes, valorSelecionado, aoSelecionar, bloqueados = [] }) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{titulo}</Text>
      <View style={s.wrap}>
        {opcoes.map(x => {
          const estaBloqueado = bloqueados.includes(x);
          const estaSelecionado = valorSelecionado === x && !estaBloqueado;
          return (
            <TouchableOpacity
              key={x}
              disabled={estaBloqueado}
              onPress={() => aoSelecionar(x)}
              style={[s.choice, estaSelecionado && s.selected, estaBloqueado && s.blocked]}
            >
              <Text style={{ color: estaBloqueado ? '#666' : estaSelecionado ? '#000' : '#ddd' }}>
                {estaBloqueado ? `${x} (OCUPADO)` : x}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}