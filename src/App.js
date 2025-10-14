import React, { useState, useEffect, useRef, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, collection, query, onSnapshot, updateDoc, deleteDoc } from 'firebase/firestore';
// Pustaka html2canvas dan jspdf akan dimuat secara dinamis dan diakses dari objek window.

// --- Global Constants (Provided by environment) ---
// --- Global Constants (For Vercel Deployment) ---
// --- Global Constants (For Vercel Deployment) ---
const firebaseConfig = JSON.parse(process.env.REACT_APP_FIREBASE_CONFIG);
const initialAuthToken = null; // Tidak digunakan di Vercel
const appId = firebaseConfig.appId || 'default-app-id'; // Ambil dari config

// --- Daftar Harga Produk BBM (per Oktober 2025) ---
const productPrices = {
    'Pertalite': 10000,
    'Pertamax': 12200,
    'Pertamax Turbo': 13100,
    'Dexlite': 13700,
    'Pertamina Dex': 14000,
    'Solar Subsidi': 6800,
};

// --- Daftar Subsidi ---
const productSubsidies = {
    'Pertalite': { nonSubsidyPrice: 10612, subsidyAmount: 612 },
    'Solar Subsidi': { nonSubsidyPrice: 7412, subsidyAmount: 612 },
    // Produk lain dianggap tidak ada subsidi
};

// Utility for formatting currency (Rupiah)
const formatRupiah = (number) => {
  if (number === null || number === undefined || isNaN(number)) return '0';
  // Memformat angka menjadi string dengan pemisah ribuan (titik)
  return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
};

// Utility for formatting time/date
const formatTime = (date) => {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`; // Mengubah format waktu agar lebih rapat
}

const formatDate = (date) => {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

// Utility to create a unique ID for new documents
const generateId = () => {
    return 'spbu-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
};

// --- Initial Data Structure (Updated to match the user's example image) ---
const initialTransactionData = {
    shift: '1',
    noTrans: 'Otomatis', // Akan di-generate secara otomatis
    date: formatDate(new Date()), // Tetap dinamis
    time: formatTime(new Date()), // Tetap dinamis
    islandPump: '4',
    productName: 'Pertalite',
    pricePerLiter: productPrices['Pertalite'], // Harga otomatis dari daftar
    volume: 20.00,
    cashAmount: 200000,
    operator: 'OPERATOR',
    nopol: 'H 1490 LF',
};

const initialSpbuConfig = {
    name: 'SPBU SEMARANG DEMAK, BATU',
    address: 'JL. RY SEMARANG DEMAK DS.BATU',
    footerNote: 'Anda mendapat subsidi dari\nPemerintah sebesar Rp {subsidi}\n(Perhitungan Subsidi Unaudited\natau Estimasi). Gunakan BBM\nSubsidi secara bijak.',
    receiptWidth: 300, // For canvas generation reference
    id: generateId(),
};

// --- Logo Component ---
const PertaminaLogo = () => (
    <img 
        src="https://i.imgur.com/FBUxswV.png" 
        alt="Pertamina Logo" 
        style={{ width: '120px', height: 'auto', margin: '0 auto', display: 'block' }} 
        className="mb-1"
        crossOrigin="anonymous" // Diperlukan untuk html2canvas
    />
);


// --- Receipt Component (The core visual output) ---
const ReceiptView = React.forwardRef(({ spbu, transaction, totalPrice, receiptModel }, ref) => {
    const receiptStyle = "font-['Courier_New',_Courier,_monospace] text-xs text-black leading-tight bg-white p-4";
    const totalVolume = parseFloat(transaction.volume) || 0;
    const priceLiter = parseFloat(transaction.pricePerLiter) || 0;
    const finalPrice = totalPrice || (totalVolume * priceLiter);
    const cash = parseFloat(transaction.cashAmount) || finalPrice;
    
    // Data untuk Model 2 (Subsidi)
    const subsidyInfo = productSubsidies[transaction.productName];
    const totalNonSubsidy = subsidyInfo ? subsidyInfo.nonSubsidyPrice * totalVolume : finalPrice;
    const totalSubsidy = subsidyInfo ? subsidyInfo.subsidyAmount * totalVolume : 0;

    const addressLines = spbu.address ? spbu.address.split('\n') : [];
    
    // Menyesuaikan footer untuk menampilkan total subsidi
    const footerNoteWithSubsidy = spbu.footerNote ? spbu.footerNote.replace('{subsidi}', formatRupiah(Math.round(totalSubsidy))) : '';
    const footerLines = footerNoteWithSubsidy.split('\n');

    if (receiptModel === '2') {
        return (
            <div ref={ref} className={receiptStyle} style={{ width: `${spbu.receiptWidth || 300}px`, margin: '0 auto' }}>
                <div className="text-center">
                    <PertaminaLogo />
                    <p className="font-bold">4459521</p>
                </div>
                <div className="mt-2">
                    <p>{spbu.name}</p>
                    <p>{spbu.address}</p>
                </div>
                <div className="flex justify-between mt-1">
                    <span>Shift: {transaction.shift}</span>
                    <span>No. Trans: {transaction.noTrans}</span>
                </div>
                <div className="">Waktu: {transaction.date} {transaction.time}</div>

                <div className="border-t border-dashed border-black my-2 h-0"></div>

                <div className="flex justify-between"><span>Pulau/Pompa</span><span>: {transaction.islandPump}</span></div>
                <div className="flex justify-between"><span>Operator</span><span>: {transaction.operator}</span></div>
                <div className="flex justify-between"><span>Jenis BBM</span><span>: {transaction.productName}</span></div>
                <div className="flex justify-between"><span>Volume</span><span>: {totalVolume.toFixed(2)} liter</span></div>
                
                {subsidyInfo && (
                <>
                    <p className="mt-2">Informasi Harga BBM (Rp/Liter)</p>
                    <div className="flex justify-between ml-2"><span>Harga Non Subsidi</span><span>: {formatRupiah(subsidyInfo.nonSubsidyPrice)}</span></div>
                    <div className="flex justify-between ml-2"><span>Subsidi Pemerintah</span><span>: {formatRupiah(subsidyInfo.subsidyAmount)}</span></div>
                    <div className="flex justify-between ml-2"><span>Harga Jual</span><span>: {formatRupiah(priceLiter)}</span></div>
                    
                    <p className="mt-2">Total Penjualan (Rp)</p>
                    <div className="flex justify-between ml-2"><span>Tanpa Subsidi</span><span>: {formatRupiah(Math.round(totalNonSubsidy))}</span></div>
                    <div className="flex justify-between ml-2"><span>Subsidi Pemerintah</span><span>: {formatRupiah(Math.round(totalSubsidy))}</span></div>
                    <div className="flex justify-between ml-2"><span>Dibayar Konsumen</span><span>: {formatRupiah(Math.round(finalPrice))}</span></div>
                </>
                )}

                {!subsidyInfo && (
                    <div className="flex justify-between font-bold mt-2"><span>Total Harga</span><span>: Rp. {formatRupiah(finalPrice)}</span></div>
                )}
                
                <div className="flex justify-between mt-3">
                    <span>CASH</span>
                    <span>{formatRupiah(cash)}</span>
                </div>

                <div className="flex justify-between mt-1">
                    <span>No. Plat</span>
                    <span>: {transaction.nopol}</span>
                </div>

                {subsidyInfo && (
                    <div className="text-center mt-3 text-[10px] whitespace-pre-line">
                        {footerLines.map((line, index) => (<p key={index}>{line}</p>))}
                    </div>
                )}
            </div>
        );
    }
    
    // Model 1 (Default)
    return (
        <div ref={ref} className={receiptStyle} style={{ width: `${spbu.receiptWidth || 300}px`, margin: '0 auto' }}>
            <div className="text-center">
                 <PertaminaLogo />
                 <p className="text-sm font-bold">{spbu.name}</p>
                 {addressLines.map((line, index) => (
                    <p key={index} className="text-xs">{line}</p>
                 ))}
            </div>

            <div className="border-t border-b border-dashed border-black my-2 h-0"></div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-1 mb-2">
                <div className="flex justify-between"><span>Shift</span><span>: {transaction.shift}</span></div>
                <div className="flex justify-between"><span>No. Trans</span><span>: {transaction.noTrans}</span></div>
                <div className="flex justify-between col-span-2"><span>Waktu</span><span>: {transaction.date}  {transaction.time}</span></div>
            </div>

            <div className="border-t border-b border-dashed border-black my-2 h-0"></div>

            <div className="space-y-1">
                <div className="flex justify-between"><span>Pulau/Pompa</span><span>: {transaction.islandPump}</span></div>
                <div className="flex justify-between"><span>Nama Produk</span><span>: {transaction.productName}</span></div>
                <div className="flex justify-between"><span>Harga/Liter</span><span>: Rp. {formatRupiah(priceLiter)}</span></div>
                <div className="flex justify-between"><span>Volume</span><span>: (L) {totalVolume.toFixed(2)}</span></div>
                <div className="flex justify-between font-bold"><span>Total Harga</span><span>: Rp. {formatRupiah(finalPrice)}</span></div>
                <div className="flex justify-between"><span>Operator</span><span>: {transaction.operator}</span></div>
                <div className="flex justify-between"><span>Nopol</span><span>: {transaction.nopol}</span></div>
            </div>

            <div className="border-t border-b border-dashed border-black my-2 h-0"></div>

            <div className="flex justify-between mt-3 font-bold">
                <span>CASH</span>
                <span>{formatRupiah(cash)}</span>
            </div>
            
            <div className="border-t border-b border-dashed border-black my-2 h-0"></div>

            <div className="text-center mt-3 text-[10px] whitespace-pre-line">
                {spbu.footerNote.split('\n').map((line, index) => (<p key={index}>{line}</p>))}
            </div>
        </div>
    );
});


// --- Main Application Component ---
export default function App() {
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [spbuList, setSpbuList] = useState([]);
    const [selectedSpbuId, setSelectedSpbuId] = useState('');
    const [currentSpbu, setCurrentSpbu] = useState(initialSpbuConfig);
    const [transaction, setTransaction] = useState(initialTransactionData);
    const [feedback, setFeedback] = useState({ message: '', type: '' });
    const [isEditingSpbu, setIsEditingSpbu] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [outputFormat, setOutputFormat] = useState('jpg');
    const [receiptModel, setReceiptModel] = useState('1'); // State untuk model nota
    const [scriptsLoaded, setScriptsLoaded] = useState(false);
    const receiptRef = useRef(null);
    const totalPrice = (parseFloat(transaction.volume) || 0) * (parseFloat(transaction.pricePerLiter) || 0);

    // Effect untuk memuat script eksternal (html2canvas & jspdf)
    useEffect(() => {
        const loadScript = (src) => {
            return new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = src;
                script.onload = () => resolve(script);
                script.onerror = () => reject(new Error(`Gagal memuat script: ${src}`));
                document.body.appendChild(script);
            });
        };

        Promise.all([
            loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'),
            loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js')
        ]).then(() => {
            setScriptsLoaded(true);
        }).catch(error => {
            console.error(error);
            setFeedback({ message: 'Gagal memuat pustaka. Fitur download tidak akan berfungsi.', type: 'error' });
        });

        return () => { // Fungsi cleanup untuk menghapus script saat komponen dibongkar
            const scripts = document.querySelectorAll('script[src*="html2canvas"], script[src*="jspdf"]');
            scripts.forEach(s => s.remove());
        };
    }, []); // Array dependensi kosong memastikan ini hanya berjalan sekali

    useEffect(() => {
        try {
            const app = initializeApp(firebaseConfig);
            const dbInstance = getFirestore(app);
            const authInstance = getAuth(app);
            setDb(dbInstance);
            setAuth(authInstance);
            const unsubscribe = onAuthStateChanged(authInstance, async (user) => {
    if (!user) {
        // Jika tidak ada user, langsung sign in secara anonim
        await signInAnonymously(authInstance);
    }
    setUserId(authInstance.currentUser?.uid || 'anonymous');
    setIsAuthReady(true);
    setIsLoading(false);
});
            return () => unsubscribe();
        } catch (error) {
            console.error("Firebase initialization failed:", error);
            setFeedback({ message: `Gagal inisialisasi Firebase: ${error.message}`, type: 'error' });
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!isAuthReady || !db) return;
        const spbuColRef = collection(db, 'artifacts', appId, 'public', 'data', 'spbu_configs');
        const q = query(spbuColRef);
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setSpbuList(list);
            if (list.length > 0 && !selectedSpbuId) {
                setSelectedSpbuId(list[0].id);
            }
        }, (error) => {
            console.error("Error fetching SPBU list:", error);
            setFeedback({ message: 'Gagal memuat daftar SPBU.', type: 'error' });
        });
        return () => unsubscribe();
    }, [isAuthReady, db]);

    useEffect(() => {
        const selected = spbuList.find(spbu => spbu.id === selectedSpbuId);
        if (selected) {
            setCurrentSpbu(selected);
        } else if (spbuList.length > 0) {
            setSelectedSpbuId(spbuList[0].id);
            setCurrentSpbu(spbuList[0]);
        } else {
            setCurrentSpbu(initialSpbuConfig);
        }
    }, [selectedSpbuId, spbuList]);

    const handleTransactionChange = useCallback((e) => {
        const { name, value } = e.target;
        
        const updatedTransaction = { ...transaction, [name]: value };

        if (name === 'productName') {
            updatedTransaction.pricePerLiter = productPrices[value] || 0;
        }

        if (['volume', 'cashAmount'].includes(name)) {
            updatedTransaction[name] = parseFloat(value) || 0;
        }

        setTransaction(updatedTransaction);
    }, [transaction]);

    const handleSpbuChange = useCallback((e) => {
        const { name, value } = e.target;
        setCurrentSpbu(prev => ({ ...prev, [name]: name === 'receiptWidth' ? parseInt(value) || 0 : value }));
    }, []);

    const handleSaveSpbu = async () => {
        if (!db || !currentSpbu.name) {
            setFeedback({ message: 'Nama SPBU tidak boleh kosong.', type: 'error' });
            return;
        }
        try {
            const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'spbu_configs', currentSpbu.id);
            await setDoc(docRef, currentSpbu, { merge: true });
            setSelectedSpbuId(currentSpbu.id);
            setFeedback({ message: 'Konfigurasi SPBU berhasil disimpan!', type: 'success' });
            setIsEditingSpbu(false);
        } catch (error) {
            console.error("Error saving SPBU:", error);
            setFeedback({ message: `Gagal menyimpan SPBU: ${error.message}`, type: 'error' });
        }
    };

    const handleAddNewSpbu = () => {
        setCurrentSpbu({ ...initialSpbuConfig, id: generateId(), name: 'SPBU BARU', address: 'Alamat SPBU Baru' });
        setIsEditingSpbu(true);
        setSelectedSpbuId('');
    };

    const handleDeleteSpbu = async () => {
        if (!db || !currentSpbu.id || spbuList.length <= 1) {
            setFeedback({ message: 'Minimal harus ada satu SPBU.', type: 'error' });
            return;
        }
        if (!window.confirm(`PERINGATAN: Anda akan menghapus SPBU: ${currentSpbu.name}. Lanjutkan?`)) return;
        try {
            const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'spbu_configs', currentSpbu.id);
            await deleteDoc(docRef);
            setSelectedSpbuId(spbuList.filter(s => s.id !== currentSpbu.id)[0]?.id || '');
            setFeedback({ message: 'SPBU berhasil dihapus.', type: 'success' });
            setIsEditingSpbu(false);
        } catch (error) {
            console.error("Error deleting SPBU:", error);
            setFeedback({ message: `Gagal menghapus SPBU: ${error.message}`, type: 'error' });
        }
    };

    const handleGenerateOutput = async () => {
        if (!scriptsLoaded) {
            setFeedback({ message: 'Pustaka sedang dimuat, mohon tunggu sebentar.', type: 'error' });
            return;
        }
        if (typeof window.html2canvas === 'undefined') {
            setFeedback({ message: 'Error: Pustaka html2canvas tidak ditemukan.', type: 'error' });
            return;
        }
        if (outputFormat === 'pdf' && (typeof window.jspdf === 'undefined')) {
            setFeedback({ message: 'Error: Pustaka jsPDF tidak ditemukan.', type: 'error' });
            return;
        }

        if (!receiptRef.current) return;
        setIsGenerating(true);
        
        // Generate nomor transaksi acak 6 digit
        const newTransNo = Math.floor(100000 + Math.random() * 900000).toString();
        
        setTransaction(prev => ({ 
            ...prev, 
            noTrans: newTransNo,
        }));

        await new Promise(resolve => setTimeout(resolve, 50)); // Tunggu update state

        try {
            const canvas = await window.html2canvas(receiptRef.current, { scale: 3, useCORS: true, backgroundColor: 'white' });
            const fileName = `nota-spbu-${newTransNo}`;

            if (outputFormat === 'jpg') {
                const imgData = canvas.toDataURL('image/jpeg', 0.9);
                const link = document.createElement('a');
                link.href = imgData;
                link.download = `${fileName}.jpg`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            } else if (outputFormat === 'pdf') {
                const imgData = canvas.toDataURL('image/png');
                const { jsPDF } = window.jspdf;
                const imgWidth = receiptRef.current.offsetWidth;
                const imgHeight = receiptRef.current.offsetHeight;
                const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [imgWidth, imgHeight] });
                pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
                pdf.save(`${fileName}.pdf`);
            }
        } catch (error) {
            console.error("Error generating file:", error);
            setFeedback({ message: `Gagal membuat file: ${error.message}`, type: 'error' });
        } finally {
            setIsGenerating(false);
        }
    };

    const LoadingOverlay = () => (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex flex-col items-center justify-center z-50">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
            <p className="mt-4 text-white text-lg">Memuat...</p>
        </div>
    );

    const FeedbackMessage = ({ message, type }) => {
        if (!message) return null;
        const color = type === 'error' ? 'bg-red-500' : 'bg-green-500';
        return <div className={`p-3 rounded-lg text-white mb-4 ${color} transition-opacity duration-300`}>{message}</div>;
    };

    const Input = ({ label, name, inputType = 'text', value, onChange, disabled = false }) => (
        <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">{label}</label>
            <input type={inputType} name={name} value={value} onChange={onChange} disabled={disabled} className={`w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 ${disabled ? 'bg-gray-100 text-gray-500' : 'bg-white'}`} />
        </div>
    );

    const Textarea = ({ label, name, value, onChange, rows = 3 }) => (
        <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">{label}</label>
            <textarea name={name} value={value} onChange={onChange} rows={rows} className="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 whitespace-pre-wrap" />
        </div>
    );

    if (isLoading) return <LoadingOverlay />;
    const activeSpbu = currentSpbu || initialSpbuConfig;

    return (
        <div className="min-h-screen bg-gray-200 p-4 font-sans flex justify-center">
            {isGenerating && <LoadingOverlay />}
            <div className="w-full max-w-md">
                <h1 className="text-3xl font-extrabold text-center text-gray-800 mb-6 border-b-4 border-indigo-500 pb-2">Generator Nota Bensin</h1>
                <FeedbackMessage message={feedback.message} type={feedback.type} />
                
                <div className="mb-6 p-4 bg-gray-50 rounded-lg shadow-inner">
                    <h2 className="text-xl font-bold mb-3 text-gray-800">1. Pilih SPBU</h2>
                    <div className="flex space-x-2">
                        <select value={selectedSpbuId} onChange={(e) => { setSelectedSpbuId(e.target.value); setIsEditingSpbu(false); }} className="flex-grow p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white" disabled={spbuList.length === 0}>
                            {spbuList.length === 0 ? (<option value="">Tidak ada SPBU</option>) : (spbuList.map(spbu => (<option key={spbu.id} value={spbu.id}>{spbu.name}</option>)))}
                        </select>
                        <button onClick={() => { selectedSpbuId ? setIsEditingSpbu(true) : setFeedback({ message: 'Pilih SPBU untuk diedit.', type: 'error' }); }} className="bg-yellow-500 text-white p-3 rounded-lg font-semibold shadow-md hover:bg-yellow-600 transition">Edit</button>
                        <button onClick={handleAddNewSpbu} className="bg-green-600 text-white p-3 rounded-lg font-semibold shadow-md hover:bg-green-700 transition">Baru</button>
                    </div>
                    <p className="mt-2 text-xs text-gray-500 break-all">UserID: {userId || '...'}</p>
                </div>

                {isEditingSpbu && (
                    <div className="mb-6 p-4 bg-white rounded-lg shadow-xl border-t-4 border-blue-500">
                        <h2 className="text-xl font-bold mb-4 text-blue-700">Edit Konfigurasi SPBU</h2>
                        <div className="space-y-4">
                            <Input label="Nama SPBU" name="name" value={currentSpbu.name || ''} onChange={handleSpbuChange} />
                            <Textarea label="Alamat (Enter untuk baris baru)" name="address" value={currentSpbu.address || ''} onChange={handleSpbuChange} />
                            <Textarea label="Catatan Kaki (Enter untuk baris baru)" name="footerNote" value={currentSpbu.footerNote || ''} onChange={handleSpbuChange} rows={5} />
                            <Input label="Lebar Nota (px)" name="receiptWidth" value={currentSpbu.receiptWidth || 300} onChange={handleSpbuChange} inputType="tel" />
                        </div>
                        <div className="flex space-x-3 mt-5">
                            <button onClick={handleSaveSpbu} className="flex-grow bg-blue-600 text-white p-3 rounded-lg font-semibold shadow-lg hover:bg-blue-700 transition">Simpan</button>
                            <button onClick={() => { setIsEditingSpbu(false); const s = spbuList.find(spbu => spbu.id === selectedSpbuId) || spbuList[0] || initialSpbuConfig; setCurrentSpbu(s); }} className="bg-gray-400 text-white p-3 rounded-lg font-semibold hover:bg-gray-500 transition">Batal</button>
                            {spbuList.length > 1 && (<button onClick={handleDeleteSpbu} className="bg-red-500 text-white p-3 rounded-lg font-semibold hover:bg-red-600 transition">Hapus</button>)}
                        </div>
                    </div>
                )}

                {!isEditingSpbu && (
                    <>
                        <div className="mb-6 p-4 bg-gray-50 rounded-lg shadow-inner">
                            <h2 className="text-xl font-bold mb-3 text-gray-800">2. Data Transaksi</h2>
                            <div className="grid grid-cols-2 gap-4">
                                <Input label="Shift" name="shift" value={transaction.shift} onChange={handleTransactionChange} inputType="tel" />
                                <Input label="No. Transaksi (Otomatis)" name="noTrans" value={transaction.noTrans} onChange={() => {}} disabled={true} />
                                <Input label="Tanggal (DD/MM/YYYY)" name="date" value={transaction.date} onChange={handleTransactionChange} disabled={false} />
                                <Input label="Waktu (HH:MM:SS)" name="time" value={transaction.time} onChange={handleTransactionChange} disabled={false} />
                                <Input label="Pulau/Pompa" name="islandPump" value={transaction.islandPump} onChange={handleTransactionChange} />
                                <div>
                                    <label className="text-sm font-medium text-gray-700 block mb-1">Nama Produk</label>
                                    <select 
                                        name="productName" 
                                        value={transaction.productName} 
                                        onChange={handleTransactionChange}
                                        className="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                                    >
                                        {Object.keys(productPrices).map(product => (
                                            <option key={product} value={product}>{product}</option>
                                        ))}
                                    </select>
                                </div>
                                <Input label="Harga/Liter (Rp)" name="pricePerLiter" value={transaction.pricePerLiter} onChange={() => {}} disabled={true} />
                                <Input label="Volume (Liter)" name="volume" value={transaction.volume} onChange={handleTransactionChange} inputType="text" />
                                <Input label="Operator" name="operator" value={transaction.operator} onChange={handleTransactionChange} />
                                <Input label="Nopol" name="nopol" value={transaction.nopol} onChange={handleTransactionChange} />
                                <div className="col-span-2"><Input label="Uang Tunai (CASH - Rp)" name="cashAmount" value={transaction.cashAmount} onChange={handleTransactionChange} inputType="tel" /></div>
                            </div>
                            <div className="mt-4 p-3 bg-blue-100 border-l-4 border-blue-500 text-blue-800 font-semibold rounded"><p>TOTAL HARGA: Rp. {formatRupiah(totalPrice)}</p></div>
                        </div>

                        <div className="mb-6 p-4 bg-white rounded-lg shadow-xl border-t-4 border-indigo-500">
                            <h2 className="text-xl font-bold mb-3 text-gray-800">3. Preview & Generate</h2>
                            
                            <div className="mb-4">
                                <label className="text-sm font-medium text-gray-700 block mb-2">Pilih Format Output:</label>
                                <div className="flex justify-center space-x-4 bg-gray-100 p-2 rounded-lg">
                                    <label className="flex items-center space-x-2 cursor-pointer"><input type="radio" name="format" value="jpg" checked={outputFormat === 'jpg'} onChange={() => setOutputFormat('jpg')} className="form-radio h-5 w-5 text-indigo-600" /><span className="font-semibold text-gray-800">JPG</span></label>
                                    <label className="flex items-center space-x-2 cursor-pointer"><input type="radio" name="format" value="pdf" checked={outputFormat === 'pdf'} onChange={() => setOutputFormat('pdf')} className="form-radio h-5 w-5 text-indigo-600" /><span className="font-semibold text-gray-800">PDF</span></label>
                                </div>
                            </div>
                            
                            <div className="mb-4">
                                <label className="text-sm font-medium text-gray-700 block mb-2">Pilih Tampilan Nota:</label>
                                <div className="flex justify-center space-x-4 bg-gray-100 p-2 rounded-lg">
                                    <label className="flex items-center space-x-2 cursor-pointer"><input type="radio" name="model" value="1" checked={receiptModel === '1'} onChange={() => setReceiptModel('1')} className="form-radio h-5 w-5 text-indigo-600" /><span className="font-semibold text-gray-800">Model 1</span></label>
                                    <label className="flex items-center space-x-2 cursor-pointer"><input type="radio" name="model" value="2" checked={receiptModel === '2'} onChange={() => setReceiptModel('2')} className="form-radio h-5 w-5 text-indigo-600" /><span className="font-semibold text-gray-800">Model 2</span></label>
                                </div>
                            </div>

                            <div className="mt-4 p-2 bg-gray-100 border border-dashed border-gray-400 overflow-x-auto">
                                <p className="text-center text-xs text-gray-600 mb-2">PRATINJAU NOTA ({activeSpbu.receiptWidth || 300}px)</p>
                                <ReceiptView ref={receiptRef} spbu={activeSpbu} transaction={transaction} totalPrice={totalPrice} receiptModel={receiptModel} />
                            </div>
                            
                            <button onClick={handleGenerateOutput} className="w-full mt-5 bg-indigo-600 text-white p-4 rounded-xl text-lg font-bold shadow-lg shadow-indigo-500/50 hover:bg-indigo-700 transition duration-300 flex items-center justify-center space-x-2 disabled:bg-gray-400 disabled:cursor-not-allowed" disabled={isGenerating || !scriptsLoaded}>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                <span>{isGenerating ? 'Mempersiapkan...' : `Generate & Download ${outputFormat.toUpperCase()}`}{!scriptsLoaded && ' (Memuat...)'}</span>
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

