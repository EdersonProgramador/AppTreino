import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3333";

type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "USER";
};

type Workout = {
  title: string;
  days: Array<{
    title: string;
    exercises: Array<{
      id: string;
      name: string;
      sets: number;
      reps: string;
      restSeconds?: number;
    }>;
  }>;
};

type EventRow = {
  id: string;
  title: string;
  startsAt: string;
  location?: string | null;
  registered?: boolean;
};

async function request<T>(path: string, options: RequestInit = {}, token?: string | null): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export default function App() {
  const [email, setEmail] = useState("aluno@app-treino.local");
  const [password, setPassword] = useState("123456");
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function login() {
    setLoading(true);
    setFeedback(null);

    try {
      const response = await request<{ user: AuthUser; token: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      setToken(response.token);
      setUser(response.user);
    } catch {
      setFeedback("Nao foi possivel entrar. Verifique API, banco e credenciais.");
    } finally {
      setLoading(false);
    }
  }

  async function loadStudentArea(currentToken: string) {
    try {
      const [workoutResponse, eventsResponse] = await Promise.all([
        request<{ workout: Workout | null }>("/user/workout", {}, currentToken),
        request<{ events: EventRow[] }>("/user/events", {}, currentToken)
      ]);
      setWorkout(workoutResponse.workout);
      setEvents(eventsResponse.events);
    } catch {
      setFeedback("Nao foi possivel carregar os dados do aluno.");
    }
  }

  async function registerEvent(eventId: string) {
    if (!token) return;
    await request("/user/events/register", { method: "POST", body: JSON.stringify({ eventId }) }, token);
    await loadStudentArea(token);
  }

  useEffect(() => {
    if (token) void loadStudentArea(token);
  }, [token]);

  const firstDay = workout?.days[0];

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.screen}>
        <Text style={styles.brand}>App Treino</Text>
        <Text style={styles.title}>{user ? `Ola, ${user.name}` : "Area mobile do aluno"}</Text>

        {!user ? (
          <View style={styles.panel}>
            <TextInput
              autoCapitalize="none"
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="E-mail"
              placeholderTextColor="#8f887f"
              style={styles.input}
              value={email}
            />
            <TextInput
              onChangeText={setPassword}
              placeholder="Senha"
              placeholderTextColor="#8f887f"
              secureTextEntry
              style={styles.input}
              value={password}
            />
            <TouchableOpacity disabled={loading} onPress={login} style={styles.button}>
              {loading ? <ActivityIndicator color="#15100b" /> : <Text style={styles.buttonText}>Entrar</Text>}
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>{firstDay?.title ?? "Ficha atual"}</Text>
              {(firstDay?.exercises ?? []).map((exercise) => (
                <View key={exercise.id} style={styles.row}>
                  <Text style={styles.rowTitle}>{exercise.name}</Text>
                  <Text style={styles.rowMeta}>
                    {exercise.sets}x {exercise.reps}
                  </Text>
                </View>
              ))}
            </View>

            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Eventos</Text>
              {events.map((item) => (
                <TouchableOpacity
                  disabled={item.registered}
                  key={item.id}
                  onPress={() => registerEvent(item.id)}
                  style={styles.row}
                >
                  <Text style={styles.rowTitle}>{item.title}</Text>
                  <Text style={styles.rowMeta}>{item.registered ? "Inscrito" : "Inscrever"}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {feedback && <Text style={styles.feedback}>{feedback}</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#08090b"
  },
  screen: {
    gap: 18,
    padding: 22
  },
  brand: {
    color: "#f2b461",
    fontSize: 13,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  title: {
    color: "#fff7ec",
    fontSize: 34,
    fontWeight: "900"
  },
  panel: {
    gap: 12,
    borderColor: "rgba(255,255,255,0.11)",
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: "#151817",
    padding: 16
  },
  panelTitle: {
    color: "#fff7ec",
    fontSize: 22,
    fontWeight: "900"
  },
  input: {
    minHeight: 50,
    borderColor: "rgba(255,255,255,0.14)",
    borderRadius: 8,
    borderWidth: 1,
    color: "#fff7ec",
    paddingHorizontal: 12
  },
  button: {
    alignItems: "center",
    minHeight: 50,
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "#f2b461"
  },
  buttonText: {
    color: "#15100b",
    fontWeight: "900"
  },
  row: {
    gap: 4,
    borderColor: "rgba(255,255,255,0.09)",
    borderRadius: 8,
    borderWidth: 1,
    padding: 12
  },
  rowTitle: {
    color: "#fff7ec",
    fontWeight: "800"
  },
  rowMeta: {
    color: "#f2b461",
    fontWeight: "800"
  },
  feedback: {
    color: "#ffd8d4",
    fontWeight: "800"
  }
});
