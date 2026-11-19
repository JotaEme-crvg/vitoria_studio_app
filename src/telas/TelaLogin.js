import React, { useState } from 'react';
import { Text, TextInput, Alert } from 'react-native';
import { authenticateAdmin } from '../database/adminRepository';
import { BotaoPadrao } from '../componentes/ControlesFormulario';
import { s } from '../estilos/tema';

// tela de login da área restrita da Vitória
export default function TelaLogin({ aoLogar }) {
  const [ocupado, setOcupado] = useState(false);
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');

  // confere e-mail e senha da Vitória pra liberar a área restrita
  async function entrar() {
    setOcupado(true);
    try {
      const admin = await authenticateAdmin(email, senha);
      if (!admin) {
        Alert.alert('Acesso negado', 'Confira e-mail e senha.');
        return;
      }
      setSenha('');
      aoLogar(admin);
    } catch (e) {
      Alert.alert('Erro no login', e.message);
    } finally {
      setOcupado(false);
    }
  }

  return (
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
        value={senha}
        onChangeText={setSenha}
        placeholder="Senha (123456)"
        placeholderTextColor="#777"
        secureTextEntry
      />
      <BotaoPadrao texto="ENTRAR" aoPressionar={entrar} desabilitado={ocupado} />
    </>
  );
}