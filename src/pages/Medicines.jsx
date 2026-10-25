import { useState, useEffect } from "react";
import { getMedicineByName, getMedicines } from "../services/medicines";

function Medicines() {
  const [medicine, setMedicine] = useState(null);
  const [medicines, setMedicines] = useState([]);
  const [selectedName, setSelectedName] = useState(null);
  useEffect(() => {
    if (!selectedName) return;
    getMedicineByName(selectedName).then(setMedicine).catch(console.error);
  }, [selectedName]);

  useEffect(() => {
    getMedicines().then(setMedicines).catch(console.error);
  }, []);

  return (
    <div>
      <h1>Medicines</h1>

      <ul>
        {medicines.map((m) => (
          <li key={m.id} onClick={() => setSelectedName(m.name)}>
            {m.name} - {m.drug_class}
          </li>
        ))}
      </ul>

      <p>{medicine?.name}</p>
      <ul>
        {medicine?.medicine_sections.map((s) => (
          <li key={s.id}>
            <h3>{s.section}</h3>
            <p>{s.body}</p>
            <p>{s.sources.name}</p>
            <p>{s.review_status}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default Medicines;
