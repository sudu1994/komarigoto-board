export default function Home() {
  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24, textAlign: "center" }}>
      <div>
        <h1 className="display" style={{ fontSize: 40, margin: 0 }}>困りごとボード</h1>
        <p>会議室の画面のQRコードから入ってね</p>
      </div>
    </main>
  );
}
