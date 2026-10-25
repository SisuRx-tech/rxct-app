import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { getMedicineByName, searchMedicines } from "../services/medicines";

function Medicines() {
  const [params] = useSearchParams();
  const q = params.get("q");

  const [results, setResults] = useState([]);
  const [selectedName, setSelectedName] = useState(null);
  const [medicine, setMedicine] = useState(null);

  const visibleResults = q ? results : [];
  const visibleMedicine = q && medicine?.name === selectedName ? medicine : null;

  useEffect(() => {
    if (!q) return;

    searchMedicines(q)
      .then((rows) => {
        setResults(rows);
        setSelectedName(rows.length === 1 ? rows[0].name : null);
      })
      .catch(console.error);
  }, [q]);

  useEffect(() => {
    if (!selectedName) return;
    getMedicineByName(selectedName).then(setMedicine).catch(console.error);
  }, [selectedName]);

  return (
    <div>
      <h1>Medicines</h1>

      {!q && <p>Search a medicine, class or condition.</p>}

      {visibleResults.length > 1 && (
        <ul>
          {visibleResults.map((m) => (
            <li key={m.id} onClick={() => setSelectedName(m.name)}>
              {m.name} - {m.drug_class}
            </li>
          ))}
        </ul>
      )}

      {visibleMedicine && (
        <>
          <h2>{visibleMedicine.name}</h2>

          <ul>
            {visibleMedicine.medicine_sections.map((s) => (
              <li key={s.id}>
                <h3>{s.section}</h3>
                <p>{s.body}</p>
                <p>{s.sources.name}</p>
                <p>{s.review_status}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export default Medicines;