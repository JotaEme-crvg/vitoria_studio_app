import React, { useState, useEffect } from 'react';
import { Text, TextInput, Alert } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { authenticateAdmin, getAdminForBiometrics } from '../database/adminRepository';
import { BotaoPadrao } from '../componentes/ControlesFormulario';
import { s } from '../estilos/tema';

// tela de login da área restrita da Vitória (senha ou biometria)
export default function TelaLogin({ aoLogar }) {
  const [ocupado, setOcupado] = useState(false);
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [biometriaDisponivel, setBiometriaDisponivel] = useState(false);

  // verifica ao abrir a tela se o celular possui digital ou rosto configurado
  useEffect(() => {
    (async () => {
      const temSensor = await LocalAuthentication.hasHardwareAsync();
      const temCadastro = await LocalAuthentication.isEnrolledAsync();
      setBiometriaDisponivel(temSensor && temCadastro);
    })();
  }, []);

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

  // solicita a digital ou reconhecimento facial do celular para liberar o painel
  async function entrarComBiometria() {
    setOcupado(true);
    try {
      const resultado = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Acesso restrito — VP Studio',
        cancelLabel: 'Usar senha',
        disableDeviceFallback: false
      });

      if (!resultado.success) {
        return;
      }

      const admin = await getAdminForBiometrics();
      if (!admin) {
        Alert.alert('Erro', 'Conta administrativa não encontrada no banco.');
        return;
      }

      setSenha('');
      aoLogar(admin);
    } catch (e) {
      Alert.alert('Erro na biometria', e.message);
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

      {biometriaDisponivel && (
        <BotaoPadrao
          texto="ENTRAR COM BIOMETRIA"
          aoPressionar={entrarComBiometria}
          desabilitado={ocupado}
        />
      )}
    </>
  );
}