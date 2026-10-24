import { useState, useEffect } from 'react'
import { getMedicineByName } from '../services/medicines'

function Medicines() {
  const [medicine, setMedicine] = useState(null)

  useEffect(() => {
    getMedicineByName('Streptomycin')
      .then(setMedicine)
      .catch(console.error)
  }, [])

  console.log(medicine)

  return (
    <div>
      <h1>Medicines</h1>
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