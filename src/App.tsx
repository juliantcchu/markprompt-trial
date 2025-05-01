import "./index.css";
import { APITester } from "./APITester";

export function App() {
  return (
    <div className="app" style={{ 
      backgroundColor: 'white',
      color: 'black',
      padding: '2rem',
      margin: '0 auto', 
      width: '100vw',
    }}>
      <h1 style={{ color: 'black' }}>Rate Limiter with Effect</h1>
      <p style={{ color: 'black' }}>
        A powerful rate limiter for your API
      </p>
      <APITester />
    </div>
  );
}

export default App;
