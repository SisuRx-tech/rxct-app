// RxCT drug import list
//
// Each entry is [RxCT name, FDA generic name].
//
// - RxCT name:        what the medicine is called in the app (INN style).
// - FDA generic name: the exact string the FDA stores, in capitals.
//                     It must match exactly, including the salt form.
//
// A wrong FDA name is not an error. It shows up as a "miss" in the report,
//  fix that one line and rerun.
//
// Not in this list on purpose (no FDA drug label exists for them):
// Oral rehydration salts, Ferrous sulfate.

export const DRUGS = [
  // Pain and inflammation
  ["Paracetamol", "ACETAMINOPHEN"],
  ["Ibuprofen", "IBUPROFEN"],
  ["Diclofenac", "DICLOFENAC SODIUM"],
  ["Aspirin", "ASPIRIN"],
  ["Naproxen", "NAPROXEN"],
  ["Celecoxib", "CELECOXIB"],
  ["Ketorolac", "KETOROLAC TROMETHAMINE"],
  ["Meloxicam", "MELOXICAM"],
  ["Tramadol", "TRAMADOL HYDROCHLORIDE"],
  ["Morphine", "MORPHINE SULFATE"],

  // Antibacterials
  ["Amoxicillin", "AMOXICILLIN"],
  ["Amoxicillin-clavulanate", "AMOXICILLIN AND CLAVULANATE POTASSIUM"],
  ["Ampicillin", "AMPICILLIN"],
  ["Benzylpenicillin", "PENICILLIN G POTASSIUM"],
  ["Phenoxymethylpenicillin", "PENICILLIN V POTASSIUM"],
  ["Cefalexin", "CEPHALEXIN"],
  ["Cefuroxime", "CEFUROXIME AXETIL"],
  ["Ceftriaxone", "CEFTRIAXONE SODIUM"],
  ["Cefixime", "CEFIXIME"],
  ["Ciprofloxacin", "CIPROFLOXACIN HYDROCHLORIDE"],
  ["Levofloxacin", "LEVOFLOXACIN"],
  ["Azithromycin", "AZITHROMYCIN"],
  ["Erythromycin", "ERYTHROMYCIN"],
  ["Clarithromycin", "CLARITHROMYCIN"],
  ["Doxycycline", "DOXYCYCLINE HYCLATE"],
  ["Gentamicin", "GENTAMICIN SULFATE"],
  ["Streptomycin", "STREPTOMYCIN SULFATE"],
  ["Amikacin", "AMIKACIN SULFATE"],
  ["Metronidazole", "METRONIDAZOLE"],
  ["Clindamycin", "CLINDAMYCIN HYDROCHLORIDE"],
  ["Co-trimoxazole", "SULFAMETHOXAZOLE AND TRIMETHOPRIM"],
  ["Nitrofurantoin", "NITROFURANTOIN"],
  ["Chloramphenicol", "CHLORAMPHENICOL SODIUM SUCCINATE"],
  ["Vancomycin", "VANCOMYCIN HYDROCHLORIDE"],

  // Antimalarials
  ["Artemether-lumefantrine", "ARTEMETHER AND LUMEFANTRINE"],
  ["Artesunate", "ARTESUNATE"],
  ["Chloroquine", "CHLOROQUINE PHOSPHATE"],
  ["Quinine", "QUININE SULFATE"],
  ["Primaquine", "PRIMAQUINE PHOSPHATE"],
  ["Hydroxychloroquine", "HYDROXYCHLOROQUINE SULFATE"],
  ["Atovaquone-proguanil", "ATOVAQUONE AND PROGUANIL HYDROCHLORIDE"],
  ["Sulfadoxine-pyrimethamine", "SULFADOXINE AND PYRIMETHAMINE"],

  // Tuberculosis and leprosy
  ["Isoniazid", "ISONIAZID"],
  ["Rifampicin", "RIFAMPIN"],
  ["Pyrazinamide", "PYRAZINAMIDE"],
  ["Ethambutol", "ETHAMBUTOL HYDROCHLORIDE"],
  ["Dapsone", "DAPSONE"],

  // Antivirals and HIV
  ["Tenofovir", "TENOFOVIR DISOPROXIL FUMARATE"],
  ["Lamivudine", "LAMIVUDINE"],
  ["Zidovudine", "ZIDOVUDINE"],
  ["Efavirenz", "EFAVIRENZ"],
  ["Dolutegravir", "DOLUTEGRAVIR SODIUM"],
  ["Nevirapine", "NEVIRAPINE"],
  ["Lopinavir-ritonavir", "LOPINAVIR AND RITONAVIR"],
  ["Abacavir", "ABACAVIR SULFATE"],
  ["Aciclovir", "ACYCLOVIR"],
  ["Oseltamivir", "OSELTAMIVIR PHOSPHATE"],

  // Antifungals and antiparasitics
  ["Fluconazole", "FLUCONAZOLE"],
  ["Ketoconazole", "KETOCONAZOLE"],
  ["Nystatin", "NYSTATIN"],
  ["Terbinafine", "TERBINAFINE HYDROCHLORIDE"],
  ["Albendazole", "ALBENDAZOLE"],
  ["Mebendazole", "MEBENDAZOLE"],
  ["Ivermectin", "IVERMECTIN"],
  ["Praziquantel", "PRAZIQUANTEL"],

  // Cardiovascular
  ["Amlodipine", "AMLODIPINE BESYLATE"],
  ["Nifedipine", "NIFEDIPINE"],
  ["Lisinopril", "LISINOPRIL"],
  ["Enalapril", "ENALAPRIL MALEATE"],
  ["Ramipril", "RAMIPRIL"],
  ["Losartan", "LOSARTAN POTASSIUM"],
  ["Valsartan", "VALSARTAN"],
  ["Atenolol", "ATENOLOL"],
  ["Propranolol", "PROPRANOLOL HYDROCHLORIDE"],
  ["Bisoprolol", "BISOPROLOL FUMARATE"],
  ["Carvedilol", "CARVEDILOL"],
  ["Metoprolol", "METOPROLOL TARTRATE"],
  ["Hydrochlorothiazide", "HYDROCHLOROTHIAZIDE"],
  ["Furosemide", "FUROSEMIDE"],
  ["Spironolactone", "SPIRONOLACTONE"],
  ["Digoxin", "DIGOXIN"],
  ["Amiodarone", "AMIODARONE HYDROCHLORIDE"],
  ["Glyceryl trinitrate", "NITROGLYCERIN"],
  ["Isosorbide dinitrate", "ISOSORBIDE DINITRATE"],
  ["Atorvastatin", "ATORVASTATIN CALCIUM"],
  ["Simvastatin", "SIMVASTATIN"],
  ["Rosuvastatin", "ROSUVASTATIN CALCIUM"],
  ["Warfarin", "WARFARIN SODIUM"],
  ["Clopidogrel", "CLOPIDOGREL BISULFATE"],
  ["Heparin", "HEPARIN SODIUM"],
  ["Enoxaparin", "ENOXAPARIN SODIUM"],
  ["Hydralazine", "HYDRALAZINE HYDROCHLORIDE"],

  // Endocrine and diabetes
  ["Metformin", "METFORMIN HYDROCHLORIDE"],
  ["Glibenclamide", "GLYBURIDE"],
  ["Glimepiride", "GLIMEPIRIDE"],
  ["Pioglitazone", "PIOGLITAZONE HYDROCHLORIDE"],
  ["Sitagliptin", "SITAGLIPTIN"],
  ["Insulin", "INSULIN HUMAN"],
  ["Levothyroxine", "LEVOTHYROXINE SODIUM"],
  ["Methimazole", "METHIMAZOLE"],
  ["Prednisolone", "PREDNISOLONE"],
  ["Dexamethasone", "DEXAMETHASONE"],
  ["Hydrocortisone", "HYDROCORTISONE"],

  // Respiratory and allergy
  ["Salbutamol", "ALBUTEROL SULFATE"],
  ["Beclometasone", "BECLOMETHASONE DIPROPIONATE"],
  ["Budesonide", "BUDESONIDE"],
  ["Montelukast", "MONTELUKAST SODIUM"],
  ["Theophylline", "THEOPHYLLINE"],
  ["Loratadine", "LORATADINE"],
  ["Cetirizine", "CETIRIZINE HYDROCHLORIDE"],
  ["Chlorphenamine", "CHLORPHENIRAMINE MALEATE"],
  ["Promethazine", "PROMETHAZINE HYDROCHLORIDE"],
  ["Diphenhydramine", "DIPHENHYDRAMINE HYDROCHLORIDE"],

  // Gastrointestinal
  ["Omeprazole", "OMEPRAZOLE"],
  ["Esomeprazole", "ESOMEPRAZOLE MAGNESIUM"],
  ["Pantoprazole", "PANTOPRAZOLE SODIUM"],
  ["Famotidine", "FAMOTIDINE"],
  ["Metoclopramide", "METOCLOPRAMIDE HYDROCHLORIDE"],
  ["Ondansetron", "ONDANSETRON HYDROCHLORIDE"],
  ["Loperamide", "LOPERAMIDE HYDROCHLORIDE"],

  // Central nervous system
  ["Diazepam", "DIAZEPAM"],
  ["Lorazepam", "LORAZEPAM"],
  ["Carbamazepine", "CARBAMAZEPINE"],
  ["Phenytoin", "PHENYTOIN SODIUM"],
  ["Phenobarbital", "PHENOBARBITAL"],
  ["Valproate", "VALPROIC ACID"],
  ["Levetiracetam", "LEVETIRACETAM"],
  ["Haloperidol", "HALOPERIDOL"],
  ["Chlorpromazine", "CHLORPROMAZINE HYDROCHLORIDE"],
  ["Risperidone", "RISPERIDONE"],
  ["Olanzapine", "OLANZAPINE"],
  ["Amitriptyline", "AMITRIPTYLINE HYDROCHLORIDE"],
  ["Fluoxetine", "FLUOXETINE HYDROCHLORIDE"],
  ["Sertraline", "SERTRALINE HYDROCHLORIDE"],
  ["Lithium", "LITHIUM CARBONATE"],
  ["Ketamine", "KETAMINE HYDROCHLORIDE"],

  // Obstetrics, haematology, oncology, emergency, other
  ["Oxytocin", "OXYTOCIN"],
  ["Misoprostol", "MISOPROSTOL"],
  ["Methylergometrine", "METHYLERGONOVINE MALEATE"],
  ["Magnesium sulfate", "MAGNESIUM SULFATE"],
  ["Folic acid", "FOLIC ACID"],
  ["Phytomenadione", "PHYTONADIONE"],
  ["Tranexamic acid", "TRANEXAMIC ACID"],
  ["Allopurinol", "ALLOPURINOL"],
  ["Colchicine", "COLCHICINE"],
  ["Methotrexate", "METHOTREXATE"],
  ["Tamoxifen", "TAMOXIFEN CITRATE"],
  ["Epinephrine", "EPINEPHRINE"],
  ["Atropine", "ATROPINE SULFATE"],
  ["Lidocaine", "LIDOCAINE HYDROCHLORIDE"],
];
