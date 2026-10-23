import { BrowserRouter, Routes, Route } from "react-router-dom";
import Oscilloscope from "./pages/Oscilloscope";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Oscilloscope />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App
