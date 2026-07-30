// Placeholder de F1. La página real con el mapa, progreso y formularios
// se implementa en F3. Esta existe únicamente para que `next build` produzca
// algo servible.
export default function Home() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: "1rem",
        padding: "2rem",
        textAlign: "center",
      }}
    >
      <h1
        style={{
          fontSize: "1.5rem",
          fontWeight: 700,
          color: "#1B211D",
          letterSpacing: "-0.02em",
        }}
      >
        Camino de Santi·ago
      </h1>
      <p style={{ color: "#3B357A", maxWidth: "28ch" }}>
        En construcción. Vuelve el día del reto.
      </p>
    </main>
  );
}
