import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, StatusBar } from 'react-native';
import { initDatabase } from './src/database/connection';
import TelaInicio from './src/telas/TelaInicio';
import TelaAgendamento from './src/telas/TelaAgendamento';
import TelaLogin from './src/telas/TelaLogin';
import TelaAdmin from './src/telas/TelaAdmin';
import { s } from './src/estilos/tema';

// componente raiz q inicializa o banco e controla a navegação entre as telas
export default function App() {
  const [pagina, setPagina] = useState('home');
  const [adminLogado, setAdminLogado] = useState(null);

  useEffect(() => {
    initDatabase().catch(e => Alert.alert('Erro SQLite', e.message));
  }, []);

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#090909" />
      <View style={s.header}>
        <Text style={s.logo}>VP  STUDIO</Text>
        <TouchableOpacity onPress={() => setPagina(adminLogado ? 'admin' : 'login')}>
          <Text style={s.small}>ÁREA DA VITORIA</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {pagina === 'home' && (
          <TelaInicio aoIrParaAgendar={() => setPagina('booking')} />
        )}

        {pagina === 'booking' && (
          <TelaAgendamento aoConcluirAgendamento={() => setPagina('home')} />
        )}

        {pagina === 'login' && (
          <TelaLogin
            aoLogar={admin => {
              setAdminLogado(admin);
              setPagina('admin');
            }}
          />
        )}

        {pagina === 'admin' && (
          <TelaAdmin
            adminLogado={adminLogado}
            aoSair={() => {
              setAdminLogado(null);
              setPagina('home');
            }}
          />
        )}
      </ScrollView>

      <View style={s.nav}>
        {[['home', 'INÍCIO'], ['booking', 'AGENDAR'], [adminLogado ? 'admin' : 'login', 'ADMIN']].map(([id, label]) => (
          <TouchableOpacity key={id} onPress={() => setPagina(id)}>
            <Text style={s.navText}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}