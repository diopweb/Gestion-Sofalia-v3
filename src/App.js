import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously, signInWithCustomToken } from 'firebase/auth';
import { 
    getFirestore, 
    collection, 
    doc, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    onSnapshot,
    query,
    writeBatch,
    getDoc,
    setDoc,
    getDocs,
    where,
    limit,
    startAfter,
    orderBy,
    Timestamp
} from 'firebase/firestore';
import { Printer, Plus, Trash2, Edit, X, Users, Package, ShoppingCart, DollarSign, BarChart2, Tag, Image as ImageIcon, RotateCcw, CreditCard, CheckCircle, ListChecks, Settings, AlertCircle, Sparkles, FileText, ArrowLeft, Filter, Share2 } from 'lucide-react';

// --- Configuration Firebase ---
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// --- Initialisation de Firebase ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- Constantes ---
const PAYMENT_TYPES = ["Espèce", "Wave", "Orange Money", "Créance", "Crédit Client"];
const ROLES = { ADMIN: 'admin', VENDEUR: 'vendeur' };
const SALE_STATUS = {
    COMPLETED: 'Complété',
    PARTIALLY_RETURNED: 'Partiellement Retourné',
    RETURNED: 'Retourné',
    CREDIT: 'Créance',
};
const VAT_RATE = 0.18; // 18%
const PAGE_SIZE = 25; // Nombre d'éléments à charger par page

// --- Fonctions utilitaires ---
const formatDateTime = (isoString) => {
    if (!isoString) return 'N/A';
    const date = new Date(isoString);
    const options = { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
    return new Intl.DateTimeFormat('fr-FR', options).format(date);
};

const formatDate = (isoString) => {
    if (!isoString) return 'N/A';
    const date = new Date(isoString);
    const options = { day: '2-digit', month: '2-digit', year: 'numeric' };
    return new Intl.DateTimeFormat('fr-FR', options).format(date);
};

const toInputDate = (date) => {
  if (!date) return '';
  const d = new Date(date);
  const year = d.getFullYear();
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};


const resizeImage = (file, maxWidth, maxHeight) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let { width, height } = img;

            if (width > height) {
                if (width > maxWidth) {
                    height *= maxWidth / width;
                    width = maxWidth;
                }
            } else {
                if (height > maxHeight) {
                    width *= maxHeight / height;
                    height = maxHeight;
                }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.8));
        };
        img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
});


// --- Composants UI ---
const Modal = ({ children, onClose, size = 'md' }) => {
    const sizeClass = { md: 'max-w-md', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size];
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
            <div className={`bg-white rounded-2xl shadow-2xl w-full ${sizeClass} m-4`}>
                <div className="flex justify-end p-2 no-print"><button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={24} /></button></div>
                <div className="px-4 sm:px-8 pb-8">{children}</div>
            </div>
        </div>
    );
};

const AlertModal = ({ message, onClose }) => (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm m-4 p-8 text-center">
            <p className="mb-6">{message}</p>
            <button onClick={onClose} className="px-6 py-2 rounded-lg text-white bg-blue-500 hover:bg-blue-600 font-semibold">OK</button>
        </div>
    </div>
);

const ConfirmModal = ({ message, onConfirm, onClose }) => (
     <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm m-4 p-8 text-center">
            <AlertCircle className="mx-auto text-red-500 mb-4" size={48} />
            <p className="mb-6">{message}</p>
            <div className="flex justify-center space-x-4">
                <button onClick={onClose} className="px-6 py-2 rounded-lg text-gray-600 bg-gray-200 hover:bg-gray-300">Annuler</button>
                <button onClick={onConfirm} className="px-6 py-2 rounded-lg text-white bg-red-500 hover:bg-red-600 font-semibold">Confirmer</button>
            </div>
        </div>
    </div>
);


const StatCard = ({ icon, title, value, color }) => (
    <div className={`bg-white p-6 rounded-2xl shadow-md flex items-center space-x-4 border-l-4 ${color}`}>
        <div className="text-3xl">{icon}</div>
        <div><p className="text-sm text-gray-500 font-medium">{title}</p><p className="text-2xl font-bold text-gray-800">{value}</p></div>
    </div>
);


// --- Composant Principal: App ---
export default function App() {
    const [user, setUser] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const userRole = ROLES.ADMIN; // Default to admin
    const userPseudo = 'Admin'; // Default pseudo
    
    const [currentView, setCurrentView] = useState('dashboard');
    const [viewPayload, setViewPayload] = useState(null); // Pour passer des données aux vues
    const [products, setProducts] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [sales, setSales] = useState([]);
    const [categories, setCategories] = useState([]);
    const [payments, setPayments] = useState([]);
    const [productsToReorder, setProductsToReorder] = useState([]);
    const [companyProfile, setCompanyProfile] = useState({ name: "Sofalia Goma", address: "Dakar - Sénégal", phone: "+221776523381", logo: null });

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalContent, setModalContent] = useState(null);
    const [editingItem, setEditingItem] = useState(null);
    const [lastSaleForInvoice, setLastSaleForInvoice] = useState(null);
    const [paymentReceiptData, setPaymentReceiptData] = useState(null);

    const [alertInfo, setAlertInfo] = useState({ show: false, message: '' });
    const [confirmInfo, setConfirmInfo] = useState({ show: false, message: '', onConfirm: null });

    const showAlert = (message) => setAlertInfo({ show: true, message });
    const showConfirm = (message, onConfirm) => setConfirmInfo({ show: true, message, onConfirm });

    const navigate = (view, payload = null) => {
        setCurrentView(view);
        setViewPayload(payload);
    }

    // --- Authentification & Chargement des scripts PDF ---
    useEffect(() => {
        // Authentification
        const unsubscribeAuth = onAuthStateChanged(auth, async (authUser) => {
            if (authUser) {
                setUser(authUser);
                setIsAuthReady(true);
            } else {
                try {
                     if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                        await signInWithCustomToken(auth, __initial_auth_token);
                    } else {
                        await signInAnonymously(auth);
                    }
                } catch (error) {
                    console.error("Erreur d'authentification anonyme:", error);
                    setIsAuthReady(true);
                }
            }
        });

        // Chargement des scripts PDF
        const loadScript = (src) => {
            return new Promise((resolve, reject) => {
                if (document.querySelector(`script[src="${src}"]`)) {
                    resolve();
                    return;
                }
                const script = document.createElement('script');
                script.src = src;
                script.onload = () => resolve();
                script.onerror = () => reject(new Error(`Script load error for ${src}`));
                document.body.appendChild(script);
            });
        };

        Promise.all([
            loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"),
            loadScript("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js")
        ]).catch(error => console.error("Erreur de chargement des scripts PDF:", error));

        return () => unsubscribeAuth();
    }, []);

    // --- Souscription aux données Firestore ---
    useEffect(() => {
        if (!isAuthReady) return;
        
        const unsubscribers = [];

        const productsPath = `artifacts/${appId}/public/data/products`;
        const productsQuery = query(collection(db, productsPath));
        unsubscribers.push(onSnapshot(productsQuery, (snapshot) => {
            const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setProducts(items);
            setProductsToReorder(items.filter(p => p.quantity <= (p.reorderThreshold || 0) && p.quantity > 0));
        }));

        const customersPath = `artifacts/${appId}/public/data/customers`;
        unsubscribers.push(onSnapshot(collection(db, customersPath), (snapshot) => setCustomers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })))));

        const categoriesPath = `artifacts/${appId}/public/data/categories`;
        unsubscribers.push(onSnapshot(collection(db, categoriesPath), (snapshot) => setCategories(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })))));

        const paymentsPath = `artifacts/${appId}/public/data/payments`;
        unsubscribers.push(onSnapshot(collection(db, paymentsPath), (snapshot) => setPayments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })))));
        
        // Souscription à toutes les ventes pour le calcul du dashboard
        const salesPath = `artifacts/${appId}/public/data/sales`;
        unsubscribers.push(onSnapshot(query(collection(db, salesPath)), (snapshot) => {
             setSales(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }));

        const profileDocRef = doc(db, `artifacts/${appId}/public/data/companyProfile`, 'main');
        unsubscribers.push(onSnapshot(profileDocRef, (docSnap) => {
            if (docSnap.exists()) {
                setCompanyProfile(docSnap.data());
            } else {
                setDoc(profileDocRef, companyProfile);
            }
        }));
        
        return () => unsubscribers.forEach(unsub => unsub && unsub());
    }, [isAuthReady]);

    // --- Fonctions CRUD ---
    const handleAddItem = async (collectionName, data) => {
        if (!user) return;
        const path = `artifacts/${appId}/public/data/${collectionName}`;
        try {
            await addDoc(collection(db, path), data);
            closeModal();
        } catch (error) { console.error("Erreur d'ajout:", error); showAlert("Erreur d'ajout: " + error.message); }
    };

    const handleEditItem = async (collectionName, id, data) => {
        if (!user) return;
        const path = `artifacts/${appId}/public/data/${collectionName}`;
        try {
            await updateDoc(doc(db, path, id), data);
            closeModal();
        } catch (error) { console.error("Erreur de modification:", error); showAlert("Erreur de modification: " + error.message); }
    };
    
    const handleSaveProfile = async (profileData) => {
        if (!user) return;
        const profileDocRef = doc(db, `artifacts/${appId}/public/data/companyProfile`, 'main');
        try {
            await setDoc(profileDocRef, profileData, { merge: true });
            showAlert("Profil de l'entreprise mis à jour !");
        } catch (error) {
            console.error("Erreur de mise à jour du profil:", error);
            showAlert("Erreur de mise à jour du profil: " + error.message);
        }
    };
    
    const handleDeleteItem = async (collectionName, id) => {
        showConfirm("Êtes-vous sûr de vouloir supprimer cet élément ?", async () => {
            if (!user) return;
            try {
                const path = `artifacts/${appId}/public/data/${collectionName}`;
                await deleteDoc(doc(db, path, id));
            } catch (error) { 
                console.error("Erreur de suppression:", error); 
                showAlert("Erreur de suppression: " + error.message);
            }
        });
    };
    
    const handleAddSale = async (saleData) => {
        if (!user) return;
        const product = products.find(p => p.id === saleData.productId);
        const customer = customers.find(c => c.id === saleData.customerId);

        if (!product || product.quantity < saleData.quantity) { showAlert("Stock insuffisant !"); return; }
        if (!customer) { showAlert("Client non trouvé !"); return; }
        
        let finalTotalPrice = saleData.totalPrice;
        let customerCreditUsed = 0;

        if (saleData.paymentType === 'Crédit Client') {
            const customerBalance = customer.balance || 0;
            if (customerBalance < finalTotalPrice) {
                showAlert("Crédit client insuffisant.");
                return;
            }
            customerCreditUsed = finalTotalPrice;
        }

        const newProductQuantity = product.quantity - saleData.quantity;
        const newCustomerBalance = (customer.balance || 0) - customerCreditUsed;

        const status = saleData.paymentType === 'Créance' ? SALE_STATUS.CREDIT : SALE_STATUS.COMPLETED;
        const fullSaleData = { ...saleData, saleDate: new Date().toISOString(), status, paidAmount: status === SALE_STATUS.COMPLETED ? finalTotalPrice : 0, userId: user.uid, userPseudo };
        
        try {
            const batch = writeBatch(db);
            const productRef = doc(db, `artifacts/${appId}/public/data/products`, saleData.productId);
            const customerRef = doc(db, `artifacts/${appId}/public/data/customers`, saleData.customerId);
            const salesCol = collection(db, `artifacts/${appId}/public/data/sales`);
            const saleDocRef = doc(salesCol);

            batch.set(saleDocRef, fullSaleData);
            batch.update(productRef, { quantity: newProductQuantity });
            if (customerCreditUsed > 0) {
                 batch.update(customerRef, { balance: newCustomerBalance });
            }
            await batch.commit();
            
            setLastSaleForInvoice({ ...fullSaleData, id: saleDocRef.id, customer, product });
            
            if (status !== SALE_STATUS.CREDIT) {
                openModal('showInvoice', null, 'lg');
            } else { 
                closeModal(); 
            }
        } catch (error) { console.error("Erreur lors de l'enregistrement de la vente:", error); showAlert("Erreur: " + error.message); }
    };
    
    const handleShowInvoice = (sale) => {
        const customer = customers.find(c => c.id === sale.customerId);
        const product = products.find(p => p.id === sale.productId) || { name: sale.productName, price: sale.subtotal / sale.quantity };
        
        if (!customer) { showAlert("Impossible de retrouver le client de la vente."); return; }
        setLastSaleForInvoice({ ...sale, customer, product });
        openModal('showInvoice', null, 'lg');
    };
    
    const handleMakePayment = async (saleToPay, amountPaidStr, paymentType) => {
        const amountPaid = Number(amountPaidStr);
        if (!amountPaid || amountPaid <= 0) { showAlert("Montant invalide."); return; }
        const currentPaidAmount = saleToPay.paidAmount || 0;
        const remainingBalance = saleToPay.totalPrice - currentPaidAmount;
        if (amountPaid > remainingBalance) { showAlert("Le montant payé ne peut pas dépasser le solde restant."); return; }
        
        const newPaidAmount = currentPaidAmount + amountPaid;
        const isFullyPaid = newPaidAmount >= saleToPay.totalPrice;
        const newStatus = isFullyPaid ? SALE_STATUS.COMPLETED : SALE_STATUS.CREDIT;

        try {
            const batch = writeBatch(db);
            const saleRef = doc(db, `artifacts/${appId}/public/data/sales`, saleToPay.id);
            const paymentsCol = collection(db, `artifacts/${appId}/public/data/payments`);

            if (paymentType === 'Crédit Client') {
                const customer = customers.find(c => c.id === saleToPay.customerId);
                if (!customer || (customer.balance || 0) < amountPaid) {
                    showAlert("Crédit client insuffisant pour ce paiement.");
                    return;
                }
                const newCustomerBalance = customer.balance - amountPaid;
                const customerRef = doc(db, `artifacts/${appId}/public/data/customers`, saleToPay.customerId);
                batch.update(customerRef, { balance: newCustomerBalance });
            }
            
            const paymentData = { 
                saleId: saleToPay.id, 
                customerName: saleToPay.customerName, 
                amount: amountPaid, 
                paymentType: paymentType, 
                paymentDate: new Date().toISOString() 
            };
            batch.set(doc(paymentsCol), paymentData);
            batch.update(saleRef, { paidAmount: newPaidAmount, status: newStatus, paymentType: isFullyPaid ? paymentType : saleToPay.paymentType });
            await batch.commit();

            const receiptData = {
                ...paymentData,
                customer: customers.find(c => c.id === saleToPay.customerId),
                remainingBalance: remainingBalance - amountPaid,
                companyProfile,
            };
            setPaymentReceiptData(receiptData);
            openModal('showPaymentReceipt', null, 'lg');
        } catch (error) { 
            console.error("Erreur lors du paiement:", error); 
            showAlert("Erreur lors du paiement: " + error.message); 
        }
    };
    
    const handleAddDeposit = async (customerId, amount) => {
        const customer = customers.find(c => c.id === customerId);
        if(!customer || !amount || amount <= 0) {
            showAlert("Informations invalides pour le dépôt.");
            return;
        }
        const newBalance = (customer.balance || 0) + Number(amount);
        try {
            const customerRef = doc(db, `artifacts/${appId}/public/data/customers`, customerId);
            await updateDoc(customerRef, { balance: newBalance });
            showAlert("Dépôt enregistré avec succès !");
            closeModal();
        } catch (error) {
            console.error("Erreur lors du dépôt:", error);
            showAlert("Erreur lors du dépôt: " + error.message);
        }
    };
    
    // --- Gestion des modales ---
    const openModal = (type, item = null, size = 'md') => { setModalContent({ type, size }); setEditingItem(item); setIsModalOpen(true); };
    const closeModal = () => { setIsModalOpen(false); setModalContent(null); setEditingItem(null); setLastSaleForInvoice(null); setPaymentReceiptData(null); };

    // --- Rendu des vues ---
    const renderDashboard = () => <DashboardView sales={sales} products={products} customers={customers} categories={categories} productsToReorder={productsToReorder} openModal={openModal} />;
    const renderProducts = () => <ProductsView products={products} categories={categories} userRole={userRole} openModal={openModal} handleDelete={handleDeleteItem} />;
    const renderCategories = () => <CategoriesView categories={categories} userRole={userRole} openModal={openModal} handleDelete={handleDeleteItem} />;
    const renderCustomers = () => <CustomersView customers={customers} userRole={userRole} openModal={openModal} handleDelete={handleDeleteItem} navigate={navigate} />;
    
    const renderCustomerDetails = () => {
        if (!viewPayload || !viewPayload.id) {
            return <div>Veuillez sélectionner un client pour voir ses détails.</div>;
        }
        return <CustomerDetailsView 
            customerId={viewPayload.id} 
            customers={customers} 
            db={db} 
            appId={appId} 
            companyProfile={companyProfile} 
            openModal={openModal} 
            navigate={navigate}
        />;
    };
    
    const renderSales = () => <SalesView db={db} appId={appId} openModal={openModal} userRole={userRole} handleShowInvoice={handleShowInvoice} />;
    const renderDebts = () => <DebtsView sales={sales} openModal={openModal} />;
    const renderPayments = () => <PaymentsView payments={payments} />;
    const renderSettings = () => <SettingsView companyProfile={companyProfile} handleSaveProfile={handleSaveProfile} />;
    
    const renderModalContent = () => {
        if (!modalContent) return null;
        switch (modalContent.type) {
            case 'addProduct': case 'editProduct':
                return <ProductForm onSubmit={modalContent.type === 'addProduct' ? (d) => handleAddItem('products', d) : (d) => handleEditItem('products', editingItem.id, d)} initialData={editingItem} categories={categories} onClose={closeModal} />;
            case 'addCategory': case 'editCategory':
                return <CategoryForm onSubmit={modalContent.type === 'addCategory' ? (d) => handleAddItem('categories', d) : (d) => handleEditItem('categories', editingItem.id, d)} initialData={editingItem} categories={categories} onClose={closeModal} />;
            case 'addCustomer': case 'editCustomer':
                return <CustomerForm onSubmit={modalContent.type === 'addCustomer' ? (d) => handleAddItem('customers', d) : (d) => handleEditItem('customers', editingItem.id, d)} initialData={editingItem} onClose={closeModal} />;
            case 'addSale':
                return <SaleForm onSubmit={handleAddSale} products={products} customers={customers} onClose={closeModal} />;
            case 'makePayment':
                return <PaymentForm onSubmit={(amount, type) => handleMakePayment(editingItem, amount, type)} sale={editingItem} customers={customers} onClose={closeModal} />;
            case 'addDeposit':
                return <DepositForm customer={editingItem} onSubmit={(amount) => handleAddDeposit(editingItem.id, amount)} onClose={closeModal} />;
            case 'showInvoice':
                return <Invoice sale={lastSaleForInvoice} companyProfile={companyProfile} onClose={closeModal} />;
            case 'showPaymentReceipt':
                 return <PaymentReceipt receiptData={paymentReceiptData} onClose={closeModal} />;
            default: return null;
        }
    };
    
    const views = {
        dashboard: renderDashboard(), products: renderProducts(), categories: renderCategories(),
        customers: renderCustomers(), 'customer-details': renderCustomerDetails(), 
        sales: renderSales(), debts: renderDebts(), payments: renderPayments(),
        settings: renderSettings(),
    };

    if (!isAuthReady) {
        return <div className="flex justify-center items-center h-screen bg-gray-100">Chargement...</div>;
    }

    return (
        <>
            <style>{`.invoice-container, .receipt-container { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; } @media print { body * { visibility: hidden; } .printable-area, .printable-area * { visibility: visible; } .printable-area { position: absolute; left: 0; top: 0; width: 100%; height: 100%; margin: 0; padding: 20px; font-size: 12px; } .no-print { display: none; } }`}</style>
            <div className="flex h-screen bg-gray-100 font-sans">
                <nav className="w-64 bg-white shadow-lg flex flex-col no-print">
                    <div className="p-4 text-2xl font-bold text-gray-800 border-b h-20 flex items-center justify-center bg-transparent">
                        {companyProfile.logo ? <img src={companyProfile.logo} alt={companyProfile.name} className="max-h-full max-w-full object-contain" /> : companyProfile.name}
                    </div>
                    <ul className="flex-1 p-4 space-y-2">
                        <NavItem icon={<BarChart2 />} label="Tableau de Bord" active={currentView === 'dashboard'} onClick={() => navigate('dashboard')} />
                        <NavItem icon={<Package />} label="Produits" active={currentView === 'products'} onClick={() => navigate('products')} />
                        <NavItem icon={<Tag />} label="Catégories" active={currentView === 'categories'} onClick={() => navigate('categories')} />
                        <NavItem icon={<Users />} label="Clients" active={currentView === 'customers' || currentView === 'customer-details'} onClick={() => navigate('customers')} />
                        <NavItem icon={<ShoppingCart />} label="Ventes" active={currentView === 'sales'} onClick={() => navigate('sales')} />
                        <NavItem icon={<CreditCard />} label="Créances" active={currentView === 'debts'} onClick={() => navigate('debts')} />
                        <NavItem icon={<ListChecks />} label="Paiements" active={currentView === 'payments'} onClick={() => navigate('payments')} />
                        <NavItem icon={<Settings />} label="Paramètres" active={currentView === 'settings'} onClick={() => navigate('settings')} />
                    </ul>
                    <div className="p-4 border-t text-xs text-gray-500">
                        <p>Utilisateur: {userPseudo}</p>
                        <p className="font-bold capitalize">Rôle: {userRole}</p>
                    </div>
                </nav>
                <main className="flex-1 p-8 overflow-y-auto no-print">{views[currentView]}</main>
                {isModalOpen && (<Modal onClose={closeModal} size={modalContent?.size}>{renderModalContent()}</Modal>)}
                {alertInfo.show && <AlertModal message={alertInfo.message} onClose={() => setAlertInfo({ show: false, message: '' })} />}
                {confirmInfo.show && <ConfirmModal message={confirmInfo.message} onConfirm={() => { confirmInfo.onConfirm(); setConfirmInfo({ ...confirmInfo, show: false }); }} onClose={() => setConfirmInfo({ ...confirmInfo, show: false })} />}
            </div>
        </>
    );
}

// --- Composants de Vue et Formulaires ---
const NavItem = ({ icon, label, active, onClick }) => (
    <li><a href="#" onClick={onClick} className={`flex items-center p-3 rounded-lg transition-colors ${active ? 'bg-blue-500 text-white shadow-md' : 'text-gray-600 hover:bg-gray-200'}`}>{icon}<span className="ml-4 font-medium">{label}</span></a></li>
);

const CrudListView = ({ title, items, columns, onAdd, addLabel, actions, children }) => (
    <div className="bg-white p-8 rounded-2xl shadow-md">
        <div className="flex justify-between items-center mb-6">
            <h2 className="text-3xl font-bold text-gray-800">{title}</h2>
            {onAdd && (<button onClick={onAdd} className="flex items-center bg-blue-500 text-white font-bold py-2 px-4 rounded-lg shadow-md hover:bg-blue-600 transition-colors"><Plus size={20} className="mr-2" /> {addLabel}</button>)}
        </div>
        {children}
        <div className="overflow-x-auto">
            <table className="w-full text-left">
                <thead className="whitespace-nowrap"><tr className="border-b-2 border-gray-200">{columns.map(col => <th key={col.header} className="p-4 font-semibold text-gray-600">{col.header}</th>)}{actions && <th className="p-4 font-semibold text-gray-600 text-right">Actions</th>}</tr></thead>
                <tbody>
                    {items.map(item => (
                        <tr key={item.id} className="border-b hover:bg-gray-50">
                            {columns.map(col => (<td key={col.header} className="p-4 text-gray-700">{col.render ? col.render(item) : item[col.accessor]}</td>))}
                            {actions && (
                                <td className="p-4 text-right whitespace-nowrap">
                                    {actions.map((action, index) => (
                                        (!action.condition || action.condition(item)) && (
                                            <button key={index} onClick={() => action.handler(item)} className="text-blue-500 hover:text-blue-700 mr-4 last:mr-0">
                                                {action.icon}
                                            </button>
                                        )
                                    ))}
                                </td>
                            )}
                        </tr>
                    ))}
                </tbody>
            </table>
             {items.length === 0 && <p className="text-center text-gray-500 py-8">Aucun élément à afficher.</p>}
        </div>
    </div>
);


// --- VUES (remaniées en composants) ---
const DashboardView = ({ sales, products, customers, categories, productsToReorder, openModal }) => {
    const totalCredit = sales.filter(s => s.status === SALE_STATUS.CREDIT).reduce((acc, s) => acc + (s.totalPrice - (s.paidAmount || 0)), 0);
    
    const today = new Date().toISOString().split('T')[0];
    const totalSalesToday = sales
        .filter(s => s.saleDate && s.saleDate.startsWith(today))
        .reduce((acc, sale) => acc + sale.totalPrice, 0);

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold text-gray-800">Tableau de Bord</h2>
                <div className="flex space-x-2">
                    <button onClick={() => openModal('addCustomer', null, 'md')} className="flex items-center bg-green-500 text-white font-bold py-2 px-4 rounded-lg shadow-md hover:bg-green-600 transition-colors">
                        <Users size={20} className="mr-2" /> Ajouter Client
                    </button>
                    <button onClick={() => openModal('addSale', null, 'lg')} className="flex items-center bg-blue-500 text-white font-bold py-2 px-4 rounded-lg shadow-md hover:bg-blue-600 transition-colors">
                        <ShoppingCart size={20} className="mr-2" /> Nouvelle Vente
                    </button>
                </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                 <StatCard icon={<Package />} title="Produits" value={products.length} color="border-blue-500" />
                 <StatCard icon={<DollarSign />} title="Ventes du Jour" value={`${totalSalesToday.toLocaleString()} F CFA`} color="border-yellow-500" />
                 <StatCard icon={<CreditCard />} title="Créances" value={`${totalCredit.toLocaleString()} F CFA`} color="border-red-500" />
                 <StatCard icon={<Users />} title="Clients" value={customers.length} color="border-green-500" />
                 <StatCard icon={<Tag />} title="Catégories" value={categories.length} color="border-indigo-500" />
                 <StatCard icon={<ShoppingCart />} title="Total Ventes" value={sales.length} color="border-purple-500" />
            </div>

            {productsToReorder.length > 0 && (
                <div className="mt-8 bg-white p-6 rounded-2xl shadow-md">
                    <h3 className="text-xl font-bold text-orange-600 mb-4 flex items-center"><AlertCircle className="mr-2"/>Stocks Faibles</h3>
                     <table className="w-full text-left">
                        <thead><tr className="border-b"><th className="p-3">Produit</th><th className="p-3">Stock Actuel</th><th className="p-3">Seuil</th></tr></thead>
                        <tbody>
                            {productsToReorder.map(product => (
                                <tr key={product.id} className="border-b hover:bg-gray-50">
                                    <td className="p-3">{product.name}</td>
                                    <td className="p-3 font-bold text-red-500">{product.quantity}</td>
                                    <td className="p-3 text-sm text-gray-500">{product.reorderThreshold || 0}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            
             <div className="mt-8 bg-white p-6 rounded-2xl shadow-md">
                <h3 className="text-xl font-bold text-gray-700 mb-4">Ventes Récentes</h3>
                 <table className="w-full text-left">
                    <thead><tr className="border-b"><th className="p-3">Produit</th><th className="p-3">Client</th><th className="p-3">Paiement</th><th className="p-3">Total</th><th className="p-3">Date</th></tr></thead>
                    <tbody>
                        {sales.sort((a,b) => new Date(b.saleDate) - new Date(a.saleDate)).slice(0, 5).map(sale => (
                            <tr key={sale.id} className="border-b hover:bg-gray-50">
                                <td className="p-3">{sale.productName}</td><td className="p-3">{sale.customerName}</td>
                                <td className="p-3"><StatusBadge status={sale.paymentType} /></td>
                                <td className="p-3 font-medium text-green-600">{sale.totalPrice.toLocaleString()} F CFA</td>
                                <td className="p-3 text-sm text-gray-500">{formatDate(sale.saleDate)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const ProductsView = ({ products, categories, userRole, openModal, handleDelete }) => {
    const categoryMap = useMemo(() => {
        const map = {};
        categories.forEach(cat => { map[cat.id] = cat; });
        return map;
    }, [categories]);

    return (
        <CrudListView title="Produits" items={products}
            columns={[
                { header: 'Photo', accessor: 'photoURL', render: (item) => <img src={item.photoURL || 'https://placehold.co/60x60/e2e8f0/4a5568?text=N/A'} alt={item.name} className="w-12 h-12 rounded-lg object-cover" /> },
                { header: 'Nom', accessor: 'name' }, 
                { header: 'Catégorie', render: (item) => {
                    const subCat = categoryMap[item.categoryId];
                    const parentCat = subCat ? categoryMap[subCat.parentId] : null;
                    return parentCat ? `${parentCat.name} > ${subCat.name}` : subCat?.name || 'N/A';
                }},
                { header: 'Quantité', accessor: 'quantity', render: (item) => <span className={item.quantity <= (item.reorderThreshold || 0) ? 'font-bold text-red-500' : ''}>{item.quantity}</span> }, 
                { header: 'Prix', accessor: 'price', render: (item) => `${item.price.toLocaleString()} F CFA` },
            ]}
            onAdd={() => openModal('addProduct')} addLabel="Ajouter un Produit"
            actions={[ { icon: <Edit size={20} />, handler: (item) => openModal('editProduct', item) }, { icon: <Trash2 size={20} />, handler: (item) => handleDelete('products', item.id) } ]}
        />
    );
};

const CategoriesView = ({ categories, userRole, openModal, handleDelete }) => {
     const categoryMap = useMemo(() => {
        const map = {};
        categories.forEach(cat => { map[cat.id] = cat.name; });
        return map;
    }, [categories]);

    return (
        <CrudListView title="Catégories & Sous-catégories" items={categories}
            columns={[
                { header: 'Nom', accessor: 'name' },
                { header: 'Catégorie Parente', render: item => item.parentId ? categoryMap[item.parentId] : "N/A (Principale)"}
            ]}
            onAdd={() => openModal('addCategory')} addLabel="Ajouter une Catégorie"
            actions={[ { icon: <Edit size={20} />, handler: (item) => openModal('editCategory', item) }, { icon: <Trash2 size={20} />, handler: (item) => handleDelete('categories', item.id) } ]}
        />
    );
};

const CustomersView = ({ customers, userRole, openModal, handleDelete, navigate }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const filteredCustomers = customers.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));

    return (
        <CrudListView 
            title="Clients" 
            items={filteredCustomers}
            columns={[
                { header: 'Nom', render: (item) => <a href="#" onClick={(e) => { e.preventDefault(); navigate('customer-details', { id: item.id }); }} className="text-blue-600 hover:underline">{item.name}</a>},
                { header: 'Téléphone', accessor: 'phone'},
                { header: 'Crédit Client', accessor: 'balance', render: item => `${(item.balance || 0).toLocaleString()} F CFA`},
            ]}
            onAdd={() => openModal('addCustomer')} addLabel="Ajouter un Client"
            actions={[
                { icon: <DollarSign size={20} />, handler: (item) => openModal('addDeposit', item), title: "Ajouter un dépôt" },
                { icon: <Edit size={20} />, handler: (item) => openModal('editCustomer', item) }, 
                { icon: <Trash2 size={20} />, handler: (item) => handleDelete('customers', item.id) } 
            ]}
        >
            <div className="mb-4">
                <input type="text" placeholder="Rechercher un client..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full px-4 py-2 border rounded-lg" />
            </div>
        </CrudListView>
    );
};

const CustomerDetailsView = ({ customerId, customers, db, appId, navigate }) => {
    const [customerSales, setCustomerSales] = useState([]);
    const [loading, setLoading] = useState(true);
    const customer = customers.find(c => c.id === customerId);

    useEffect(() => {
        if (!customerId) return;
        setLoading(true);
        const salesRef = collection(db, `artifacts/${appId}/public/data/sales`);
        const q = query(salesRef, where("customerId", "==", customerId));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const salesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            salesData.sort((a, b) => new Date(b.saleDate) - new Date(a.saleDate));
            setCustomerSales(salesData);
            setLoading(false);
        }, (err) => {
            console.error("Erreur de lecture de l'historique des ventes:", err);
            setLoading(false);
        });
        return () => unsubscribe();
    }, [customerId, db, appId]);
    
    if (!customer) return <div>Client non trouvé. <button className="text-blue-500 underline" onClick={() => navigate('customers')}>Retour à la liste</button></div>;
    
    return (
        <div className="bg-white p-8 rounded-2xl shadow-md">
            <button onClick={() => navigate('customers')} className="flex items-center text-blue-600 hover:underline mb-4">
                <ArrowLeft size={18} className="mr-2" /> Retour à la liste des clients
            </button>
            <h2 className="text-3xl font-bold text-gray-800 mb-2">{customer.name}</h2>
            <p className="text-gray-500 mb-1">{customer.email}</p>
            <p className="text-gray-500 mb-4">{customer.phone}</p>
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg mb-6">
                <p className="text-lg font-bold text-green-700">Crédit disponible: {(customer.balance || 0).toLocaleString()} F CFA</p>
            </div>
            <h3 className="text-xl font-bold text-gray-700 mb-4">Historique des achats</h3>
             <div className="overflow-x-auto">
                {loading ? <p>Chargement...</p> : 
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b">
                                <th className="p-3">Date</th>
                                <th className="p-3">Produit</th>
                                <th className="p-3">Quantité</th>
                                <th className="p-3 text-right">Total</th>
                                <th className="p-3 text-center">Statut</th>
                            </tr>
                        </thead>
                        <tbody>
                            {customerSales.length > 0 ? (
                                customerSales.map(sale => (
                                    <tr key={sale.id} className="border-b hover:bg-gray-50">
                                        <td className="p-3">{formatDateTime(sale.saleDate)}</td>
                                        <td className="p-3">{sale.productName}</td>
                                        <td className="p-3">{sale.quantity}</td>
                                        <td className="p-3 text-right">{sale.totalPrice.toLocaleString()} F CFA</td>
                                        <td className="p-3 text-center"><StatusBadge status={sale.status} /></td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="5" className="text-center p-8 text-gray-500">Aucun achat enregistré pour ce client.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                }
            </div>
        </div>
    );
};

const SalesView = ({ db, appId, openModal, handleShowInvoice }) => {
    const [filteredSales, setFilteredSales] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeFilter, setActiveFilter] = useState('day');
    const [customStartDate, setCustomStartDate] = useState(toInputDate(new Date()));
    const [customEndDate, setCustomEndDate] = useState(toInputDate(new Date()));
    const [showFilters, setShowFilters] = useState(false);

    useEffect(() => {
        setLoading(true);
        const salesRef = collection(db, `artifacts/${appId}/public/data/sales`);
        
        let q = query(salesRef, orderBy("saleDate", "desc"));
        const now = new Date();
        let start = new Date();
        let end = new Date();

        switch (activeFilter) {
            case 'day':
                start.setHours(0, 0, 0, 0);
                end.setHours(23, 59, 59, 999);
                break;
            case 'week':
                start.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1));
                start.setHours(0, 0, 0, 0);
                end.setHours(23, 59, 59, 999);
                break;
            case 'month':
                start = new Date(now.getFullYear(), now.getMonth(), 1);
                end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
                break;
            case 'year':
                start = new Date(now.getFullYear(), 0, 1);
                end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
                break;
            case 'custom':
                 if (customStartDate && customEndDate) {
                    start = new Date(customStartDate);
                    start.setHours(0, 0, 0, 0);
                    end = new Date(customEndDate);
                    end.setHours(23, 59, 59, 999);
                } else {
                    start = null;
                }
                break;
            default: // 'all'
                start = null;
                end = null;
        }

        if (start) q = query(q, where("saleDate", ">=", start.toISOString()));
        if (end) q = query(q, where("saleDate", "<=", end.toISOString()));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            setFilteredSales(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoading(false);
        }, (error) => {
            console.error("Erreur de filtrage des ventes en temps réel:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [db, appId, activeFilter, customStartDate, customEndDate]);

    const subtotal = useMemo(() => {
        return filteredSales.reduce((acc, sale) => acc + sale.totalPrice, 0);
    }, [filteredSales]);

    return (
        <CrudListView title="Ventes" items={filteredSales}
            columns={[
                 { header: 'Produit', accessor: 'productName' }, { header: 'Client', accessor: 'customerName' },
                 { header: 'Prix Total', accessor: 'totalPrice', render: (item) => `${item.totalPrice.toLocaleString()} F CFA` },
                 { header: 'Date', accessor: 'saleDate', render: item => formatDateTime(item.saleDate)},
                 { header: 'Statut', accessor: 'status', render: (item) => <StatusBadge status={item.status} /> },
            ]}
            onAdd={() => openModal('addSale')} addLabel="Nouvelle Vente"
            actions={[
                { icon: <Printer size={20} />, handler: (item) => handleShowInvoice(item) },
            ]}
        >
             <div className="flex justify-end mb-4">
                <button 
                    onClick={() => setShowFilters(!showFilters)} 
                    className="flex items-center text-sm font-semibold text-blue-600 hover:text-blue-800"
                >
                    <Filter size={16} className="mr-1" />
                    {showFilters ? 'Masquer les filtres' : 'Afficher les filtres'}
                </button>
            </div>
             {showFilters && (
                 <div className="bg-gray-50 p-6 rounded-2xl shadow-inner mb-6 border">
                    <h3 className="text-xl font-bold mb-4">Filtrer les ventes</h3>
                    <div className="flex flex-wrap items-end gap-4">
                        <div className="flex flex-wrap gap-2">
                             <button onClick={() => setActiveFilter('day')} className={`px-4 py-2 rounded-lg text-sm ${activeFilter === 'day' ? 'bg-blue-500 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}>Aujourd'hui</button>
                             <button onClick={() => setActiveFilter('week')} className={`px-4 py-2 rounded-lg text-sm ${activeFilter === 'week' ? 'bg-blue-500 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}>Cette semaine</button>
                             <button onClick={() => setActiveFilter('month')} className={`px-4 py-2 rounded-lg text-sm ${activeFilter === 'month' ? 'bg-blue-500 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}>Ce mois</button>
                             <button onClick={() => setActiveFilter('year')} className={`px-4 py-2 rounded-lg text-sm ${activeFilter === 'year' ? 'bg-blue-500 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}>Cette année</button>
                             <button onClick={() => setActiveFilter('all')} className={`px-4 py-2 rounded-lg text-sm ${activeFilter === 'all' ? 'bg-blue-500 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}>Toutes</button>
                        </div>
                        <div className="flex items-end gap-2 border-l-2 pl-4">
                             <div>
                                <label className="text-sm font-medium text-gray-700">Du</label>
                                <input type="date" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm"/>
                             </div>
                             <div>
                                <label className="text-sm font-medium text-gray-700">Au</label>
                                 <input type="date" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm"/>
                             </div>
                             <button onClick={() => setActiveFilter('custom')} className={`px-4 py-2 rounded-lg text-sm ${activeFilter === 'custom' ? 'bg-blue-500 text-white' : 'bg-blue-200 text-blue-800 hover:bg-blue-300'}`}>Filtrer</button>
                        </div>
                    </div>
                </div>
            )}
            {filteredSales.length > 0 && <p className="mb-4 text-lg font-bold">Total des ventes affichées: {subtotal.toLocaleString()} F CFA</p>}
            {loading && <p>Chargement des ventes...</p>}
        </CrudListView>
    );
};
const DebtsView = ({ sales, openModal }) => (
    <CrudListView title="Créances" items={sales.filter(s => s.status === SALE_STATUS.CREDIT)}
        columns={[
            { header: 'Client', accessor: 'customerName' }, { header: 'Produit', accessor: 'productName' },
            { header: 'Montant Dû', accessor: 'totalPrice', render: (item) => `${(item.totalPrice - (item.paidAmount || 0)).toLocaleString()} F CFA` },
            { header: 'Date', render: (item) => formatDateTime(item.saleDate) },
            { header: 'Statut', render: (item) => <StatusBadge status={item.status} /> },
        ]}
        actions={[ { icon: <CheckCircle size={20} />, handler: (item) => openModal('makePayment', item)} ]}
    />
);
const PaymentsView = ({ payments }) => (
    <CrudListView title="Historique des Paiements" items={payments}
        columns={[
            { header: 'Date', render: (item) => formatDateTime(item.paymentDate) },
            { header: 'Client', accessor: 'customerName' },
            { header: 'Montant', render: (item) => `${item.amount.toLocaleString()} F CFA` },
            { header: 'Méthode', accessor: 'paymentType' },
        ]}
    />
);
const SettingsView = ({ companyProfile, handleSaveProfile }) => (
    <div className="bg-white p-8 rounded-2xl shadow-md">
        <h2 className="text-3xl font-bold text-gray-800 mb-6">Paramètres</h2>
        <CompanyProfileForm initialData={companyProfile} onSubmit={handleSaveProfile} />
    </div>
);


const ProductForm = ({ onSubmit, initialData, categories, onClose }) => {
    const [name, setName] = useState(initialData?.name || '');
    const [description, setDescription] = useState(initialData?.description || '');
    const [quantity, setQuantity] = useState(initialData?.quantity || 0);
    const [price, setPrice] = useState(initialData?.price || 0);
    const [photoURL, setPhotoURL] = useState(initialData?.photoURL || null);
    const [reorderThreshold, setReorderThreshold] = useState(initialData?.reorderThreshold || 0);
    const [isGenerating, setIsGenerating] = useState(false);
    
    const [parentCategoryId, setParentCategoryId] = useState('');
    const [subCategoryId, setSubCategoryId] = useState(initialData?.categoryId || '');

    const parentCategories = useMemo(() => categories.filter(c => !c.parentId), [categories]);
    const subCategories = useMemo(() => {
        if (!parentCategoryId) return [];
        return categories.filter(c => c.parentId === parentCategoryId);
    }, [categories, parentCategoryId]);
    
    useEffect(() => {
        if (initialData?.categoryId) {
            const subCat = categories.find(c => c.id === initialData.categoryId);
            if (subCat?.parentId) {
                setParentCategoryId(subCat.parentId);
                setSubCategoryId(subCat.id);
            } else {
                 setParentCategoryId(subCat.id); // It's a parent category
            }
        }
    }, [initialData, categories]);


    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit({ 
            name, description, photoURL,
            quantity: Number(quantity), 
            price: Number(price), 
            reorderThreshold: Number(reorderThreshold),
            categoryId: subCategoryId || parentCategoryId
        });
    };
    
    const handlePhotoChange = async (e) => {
        const file = e.target.files[0];
        if (file) {
            const resized = await resizeImage(file, 400, 400);
            setPhotoURL(resized);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <h3 className="text-2xl font-bold text-center text-gray-800">{initialData ? 'Modifier le Produit' : 'Ajouter un Produit'}</h3>
             <div className="flex flex-col items-center space-y-2">
                 <label className="w-full text-sm font-medium text-gray-700">Photo</label>
                <div className="w-32 h-32 rounded-lg bg-gray-100 flex items-center justify-center border-2 border-dashed">
                    {photoURL ? <img src={photoURL} alt="Aperçu" className="w-full h-full object-cover rounded-lg"/> : <ImageIcon className="text-gray-400" size={40}/>}
                </div>
                <input type="file" accept="image/*" onChange={handlePhotoChange} className="text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"/>
            </div>
            <FormField label="Nom du produit" type="text" value={name} onChange={e => setName(e.target.value)} required />
            <FormSelect label="Catégorie Principale" value={parentCategoryId} onChange={e => { setParentCategoryId(e.target.value); setSubCategoryId(''); }}>
                <option value="">Sélectionner...</option>
                {parentCategories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
            </FormSelect>
             <FormSelect label="Sous-catégorie" value={subCategoryId} onChange={e => setSubCategoryId(e.target.value)} disabled={!parentCategoryId}>
                <option value="">Sélectionner...</option>
                {subCategories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
            </FormSelect>
            <FormField label="Description" type="text" value={description} onChange={e => setDescription(e.target.value)} />
            <FormField label="Quantité en stock" type="number" value={quantity} onChange={e => setQuantity(e.target.value)} required min="0" />
            <FormField label="Seuil de réapprovisionnement" type="number" value={reorderThreshold} onChange={e => setReorderThreshold(e.target.value)} required min="0" />
            <FormField label="Prix (F CFA)" type="number" value={price} onChange={e => setPrice(e.target.value)} required min="0" step="1" />
            <div className="flex justify-end space-x-4 pt-4">
                <button type="button" onClick={onClose} className="px-6 py-2 rounded-lg text-gray-600 bg-gray-200 hover:bg-gray-300">Annuler</button>
                <button type="submit" className="px-6 py-2 rounded-lg text-white bg-blue-500 hover:bg-blue-600 font-semibold">{initialData ? 'Mettre à jour' : 'Ajouter'}</button>
            </div>
        </form>
    );
};

const CategoryForm = ({ onSubmit, initialData, categories, onClose }) => {
    const [name, setName] = useState(initialData?.name || '');
    const [parentId, setParentId] = useState(initialData?.parentId || '');
    const parentCategories = categories.filter(c => !c.parentId && c.id !== initialData?.id);
    const handleSubmit = (e) => { e.preventDefault(); onSubmit({ name, parentId: parentId || null }); };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <h3 className="text-2xl font-bold text-center text-gray-800">{initialData ? 'Modifier' : 'Ajouter'} une Catégorie</h3>
            <FormField label="Nom" type="text" value={name} onChange={e => setName(e.target.value)} required />
            <FormSelect label="Catégorie Parente (Optionnel)" value={parentId} onChange={e => setParentId(e.target.value)}>
                <option value="">Aucune (Catégorie Principale)</option>
                {parentCategories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
            </FormSelect>
             <div className="flex justify-end space-x-4 pt-4">
                <button type="button" onClick={onClose} className="px-6 py-2 rounded-lg text-gray-600 bg-gray-200 hover:bg-gray-300">Annuler</button>
                <button type="submit" className="px-6 py-2 rounded-lg text-white bg-blue-500 hover:bg-blue-600 font-semibold">{initialData ? 'Mettre à jour' : 'Ajouter'}</button>
            </div>
        </form>
    );
};


const CustomerForm = ({ onSubmit, initialData, onClose }) => {
    const [name, setName] = useState(initialData?.name || '');
    const [email, setEmail] = useState(initialData?.email || '');
    const [phone, setPhone] = useState(initialData?.phone || '');
    const handleSubmit = (e) => { e.preventDefault(); onSubmit({ name, email, phone, balance: initialData?.balance || 0 }); };
    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <h3 className="text-2xl font-bold text-center text-gray-800">{initialData ? 'Modifier le Client' : 'Ajouter un Client'}</h3>
            <FormField label="Nom complet" type="text" value={name} onChange={e => setName(e.target.value)} required />
            <FormField label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
            <FormField label="Téléphone" type="tel" value={phone} onChange={e => setPhone(e.target.value)} />
            <div className="flex justify-end space-x-4 pt-4">
                <button type="button" onClick={onClose} className="px-6 py-2 rounded-lg text-gray-600 bg-gray-200 hover:bg-gray-300">Annuler</button>
                <button type="submit" className="px-6 py-2 rounded-lg text-white bg-blue-500 hover:bg-blue-600 font-semibold">{initialData ? 'Mettre à jour' : 'Ajouter'}</button>
            </div>
        </form>
    );
};

const DepositForm = ({ customer, onSubmit, onClose }) => {
    const [amount, setAmount] = useState('');
    const handleSubmit = (e) => { e.preventDefault(); onSubmit(amount); };
    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <h3 className="text-2xl font-bold text-center text-gray-800">Ajouter un dépôt</h3>
            <p className="text-center">pour {customer.name}</p>
            <FormField label="Montant du dépôt (F CFA)" type="number" value={amount} onChange={e => setAmount(e.target.value)} required min="1" />
            <div className="flex justify-end space-x-4 pt-4">
                <button type="button" onClick={onClose} className="px-6 py-2 rounded-lg text-gray-600 bg-gray-200 hover:bg-gray-300">Annuler</button>
                <button type="submit" className="px-6 py-2 rounded-lg text-white bg-green-500 hover:bg-green-600 font-semibold">Enregistrer Dépôt</button>
            </div>
        </form>
    );
};

const SaleForm = ({ onSubmit, products, customers, onClose }) => {
    const [productId, setProductId] = useState('');
    const [customerId, setCustomerId] = useState('');
    const [quantity, setQuantity] = useState(1);
    const [paymentType, setPaymentType] = useState(PAYMENT_TYPES[0]);
    const [discountType, setDiscountType] = useState('percentage');
    const [discountValue, setDiscountValue] = useState(0);
    const [applyVAT, setApplyVAT] = useState(false);
    
    const selectedProduct = useMemo(() => products.find(p => p.id === productId), [products, productId]);
    const selectedCustomer = useMemo(() => customers.find(c => c.id === customerId), [customers, customerId]);
    
    const subtotal = selectedProduct ? selectedProduct.price * quantity : 0;
    const discountAmount = discountType === 'percentage' ? subtotal * (Number(discountValue) / 100) : Number(discountValue);
    const subtotalAfterDiscount = subtotal - discountAmount;
    const vatAmount = applyVAT ? subtotalAfterDiscount * VAT_RATE : 0;
    const finalTotal = subtotalAfterDiscount + vatAmount;

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!productId || !customerId || quantity <= 0) { alert("Veuillez remplir tous les champs."); return; }
        onSubmit({ 
            productId, 
            productName: selectedProduct.name, 
            customerId, 
            customerName: selectedCustomer.name, 
            quantity: Number(quantity), 
            subtotal: Number(subtotal),
            discountAmount: Number(discountAmount),
            vatAmount: Number(vatAmount),
            totalPrice: Number(finalTotal), 
            paymentType 
        });
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <h3 className="text-2xl font-bold text-center text-gray-800">Nouvelle Vente</h3>
            <FormSelect label="Produit" value={productId} onChange={e => setProductId(e.target.value)} required>
                <option value="" disabled>Sélectionner un produit</option>
                {products.map(p => <option key={p.id} value={p.id} disabled={p.quantity === 0}>{p.name} (Stock: {p.quantity})</option>)}
            </FormSelect>
            <FormSelect label="Client" value={customerId} onChange={e => setCustomerId(e.target.value)} required>
                <option value="" disabled>Sélectionner un client</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </FormSelect>
            <FormField label="Quantité vendue" type="number" value={quantity} onChange={e => setQuantity(e.target.value)} required min="1" max={selectedProduct?.quantity} />
            
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Remise</label>
                <div className="flex items-center">
                    <select value={discountType} onChange={e => setDiscountType(e.target.value)} className="w-1/3 px-3 py-2 border border-gray-300 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                        <option value="percentage">%</option>
                        <option value="fixed">F CFA</option>
                    </select>
                    <input type="number" value={discountValue} onChange={e => setDiscountValue(e.target.value)} min="0" className="w-2/3 px-3 py-2 border-t border-b border-r border-gray-300 rounded-r-lg focus:outline-none focus:ring-2 focus:ring-blue-500"/>
                </div>
            </div>

            <div className="flex items-center">
                <input type="checkbox" id="vat-checkbox" checked={applyVAT} onChange={e => setApplyVAT(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"/>
                <label htmlFor="vat-checkbox" className="ml-2 block text-sm text-gray-900">Appliquer la TVA (18%)</label>
            </div>
            
            <FormSelect label="Type de paiement" value={paymentType} onChange={e => setPaymentType(e.target.value)} required>
                {PAYMENT_TYPES.map(type => {
                    if(type === 'Crédit Client' && (!selectedCustomer || !selectedCustomer.balance || selectedCustomer.balance <= 0)) {
                        return null;
                    }
                    return <option key={type} value={type}>{type} {type === 'Crédit Client' && `(${(selectedCustomer?.balance || 0).toLocaleString()} F CFA)`}</option>
                })}
            </FormSelect>

            {selectedProduct && (
                <div className="pt-4 space-y-2 text-right">
                    <p>Sous-total: {subtotal.toLocaleString()} F CFA</p>
                    {discountAmount > 0 && <p className="text-red-500">Remise: -{discountAmount.toLocaleString()} F CFA</p>}
                    {applyVAT && <p>TVA (18%): +{vatAmount.toLocaleString()} F CFA</p>}
                    <p className="text-xl font-bold text-green-600">Total: {finalTotal.toLocaleString()} F CFA</p>
                </div>
            )}
            <div className="flex justify-end space-x-4 pt-4">
                <button type="button" onClick={onClose} className="px-6 py-2 rounded-lg text-gray-600 bg-gray-200 hover:bg-gray-300">Annuler</button>
                <button type="submit" className="px-6 py-2 rounded-lg text-white bg-blue-500 hover:bg-blue-600 font-semibold">Enregistrer la Vente</button>
            </div>
        </form>
    );
};

const PaymentReceipt = ({ receiptData, onClose }) => {
    if (!receiptData) return null;
    const { customer, amount, paymentType, paymentDate, remainingBalance, companyProfile } = receiptData;
    const handlePrint = () => window.print();
    const [canShare, setCanShare] = useState(false);

    useEffect(() => {
        if (navigator.share) {
            setCanShare(true);
        }
    }, []);

    const generatePdfBlob = () => {
        return new Promise((resolve) => {
            const input = document.querySelector('.receipt-container.printable-area');
            if (!input) {
                resolve(null);
                return;
            };
            input.style.backgroundColor = 'white';
            html2canvas(input, { scale: 2 }).then(canvas => {
                input.style.backgroundColor = '';
                canvas.toBlob(blob => resolve(blob), 'application/pdf');
            });
        });
    };

    const handleDownloadPDF = async () => {
        const blob = await generatePdfBlob();
        if(blob) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `recu-paiement-${customer.name.replace(/\s/g, '_')}-${paymentDate.split('T')[0]}.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    };
    
    const handleSharePDF = async () => {
        const blob = await generatePdfBlob();
        const fileName = `recu-paiement-${customer.name.replace(/\s/g, '_')}-${paymentDate.split('T')[0]}.pdf`;
        if (blob && navigator.share) {
            const file = new File([blob], fileName, { type: 'application/pdf' });
            try {
                if (navigator.canShare({ files: [file] })) {
                    await navigator.share({
                        title: 'Reçu de Paiement',
                        text: `Voici le reçu de paiement pour ${customer.name}.`,
                        files: [file]
                    });
                } else {
                    alert("Le partage de fichiers PDF n'est pas supporté sur cet appareil.");
                }
            } catch (error) {
                console.error('Erreur de partage:', error);
            }
        }
    };

    return (
        <div className="receipt-container printable-area">
             <div className="p-2 sm:p-6">
                <div className="flex justify-between items-start">
                    <div><h1 className="text-2xl font-bold">REÇU DE PAIEMENT</h1></div>
                    <div className="text-right">
                        {companyProfile.logo && <img src={companyProfile.logo} alt={companyProfile.name} className="h-12 w-auto ml-auto mb-2" />}
                        <h2 className="text-xl font-bold">{companyProfile.name}</h2>
                    </div>
                </div>
                <div className="border-b my-6"></div>
                <div className="flex justify-between mb-6">
                    <div><h3 className="font-bold mb-1">Reçu de :</h3><p>{customer.name}</p></div>
                    <div className="text-right"><p><span className="font-bold">Date :</span> {formatDateTime(paymentDate)}</p></div>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-lg">Montant Payé: <span className="font-bold text-green-600">{amount.toLocaleString()} F CFA</span></p>
                    <p>Méthode de paiement: {paymentType}</p>
                </div>
                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-lg">Solde Restant sur la Créance: <span className="font-bold text-red-600">{remainingBalance.toLocaleString()} F CFA</span></p>
                </div>
            </div>
            <div className="flex justify-end space-x-2 p-6 bg-gray-50 rounded-b-2xl no-print">
                <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-gray-600 bg-gray-200 hover:bg-gray-300">Fermer</button>
                 {canShare && (
                    <button onClick={handleSharePDF} className="flex items-center px-4 py-2 rounded-lg text-white bg-blue-600 hover:bg-blue-700 font-semibold"><Share2 size={18} className="mr-2" /> Partager</button>
                )}
                 <button onClick={handleDownloadPDF} className="flex items-center px-4 py-2 rounded-lg text-white bg-green-600 hover:bg-green-700 font-semibold"><FileText size={18} className="mr-2" /> PDF</button>
                <button onClick={handlePrint} className="flex items-center px-4 py-2 rounded-lg text-white bg-gray-500 hover:bg-gray-600 font-semibold"><Printer size={18} className="mr-2" /> Imprimer</button>
            </div>
        </div>
    );
};

const Invoice = ({ sale, companyProfile, onClose }) => {
    if (!sale) return null;
    const [canShare, setCanShare] = useState(false);

    useEffect(() => {
        if (navigator.share) {
            setCanShare(true);
        }
    }, []);

    const handlePrint = () => window.print();
    const discountAmount = sale.discountAmount || 0;
    const vatAmount = sale.vatAmount || 0;
    const subtotalAfterDiscount = sale.subtotal - discountAmount;

    const generatePdfBlob = () => {
        return new Promise((resolve) => {
            const input = document.querySelector('.invoice-container.printable-area');
            if (!input) {
                resolve(null);
                return;
            };
            input.style.backgroundColor = 'white';
            html2canvas(input, { scale: 2 }).then(canvas => {
                input.style.backgroundColor = '';
                canvas.toBlob(blob => resolve(blob), 'application/pdf');
            });
        });
    };

    const handleDownloadPDF = async () => {
        const blob = await generatePdfBlob();
        if(blob) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `facture-${sale.id}.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    };

    const handleSharePDF = async () => {
        const blob = await generatePdfBlob();
        const fileName = `facture-${sale.id}.pdf`;
        if (blob && navigator.share) {
            const file = new File([blob], fileName, { type: 'application/pdf' });
            try {
                if (navigator.canShare({ files: [file] })) {
                    await navigator.share({
                        title: `Facture ${sale.id}`,
                        text: `Voici la facture pour ${sale.customer.name}.`,
                        files: [file]
                    });
                } else {
                     alert("Le partage de fichiers PDF n'est pas supporté sur cet appareil.");
                }
            } catch (error) {
                console.error('Erreur de partage:', error);
            }
        }
    };
    
    return (
        <div className="invoice-container printable-area">
            <div className="p-2 sm:p-6">
                <div className="flex justify-between items-start">
                    <div><h1 className="text-2xl font-bold">FACTURE</h1><p className="text-gray-500">{sale.id}</p></div>
                    <div className="text-right">
                        {companyProfile.logo && <img src={companyProfile.logo} alt={companyProfile.name} className="h-12 w-auto ml-auto mb-2" />}
                        <h2 className="text-xl font-bold">{companyProfile.name}</h2>
                        <p className="text-sm">{companyProfile.address}</p>
                        <p className="text-sm">{companyProfile.phone}</p>
                    </div>
                </div>
                <div className="border-b my-6"></div>
                <div className="flex justify-between mb-6">
                    <div><h3 className="font-bold mb-1">Facturé à :</h3><p>{sale.customer?.name}</p><p>{sale.customer?.email}</p><p>{sale.customer?.phone}</p></div>
                    <div className="text-right"><p><span className="font-bold">Date & Heure :</span> {formatDateTime(sale.saleDate)}</p><p><span className="font-bold">Paiement :</span> {sale.paymentType}</p></div>
                </div>
                <table className="w-full text-left mb-8">
                    <thead><tr className="bg-gray-100"><th className="p-3 font-semibold">Produit</th><th className="p-3 font-semibold">Quantité</th><th className="p-3 font-semibold text-right">Prix Unitaire</th><th className="p-3 font-semibold text-right">Total</th></tr></thead>
                    <tbody><tr><td className="p-3 border-b">{sale.productName}</td><td className="p-3 border-b">{sale.quantity}</td><td className="p-3 border-b text-right">{(sale.subtotal / sale.quantity).toLocaleString()} F CFA</td><td className="p-3 border-b text-right">{sale.subtotal.toLocaleString()} F CFA</td></tr></tbody>
                </table>
                <div className="text-right">
                    <p className="mb-1"><span className="font-semibold">Sous-total:</span> {sale.subtotal.toLocaleString()} F CFA</p>
                    {discountAmount > 0 && <p className="mb-1 text-red-500"><span className="font-semibold">Remise:</span> -{discountAmount.toLocaleString()} F CFA</p>}
                    <p className="mb-1"><span className="font-semibold">Montant HT:</span> {subtotalAfterDiscount.toLocaleString()} F CFA</p>
                    {vatAmount > 0 && <p className="mb-1"><span className="font-semibold">TVA (18%):</span> +{vatAmount.toLocaleString()} F CFA</p>}
                    <p className="text-2xl font-bold"><span className="font-semibold">TOTAL TTC:</span> {sale.totalPrice.toLocaleString()} F CFA</p>
                </div>
                <div className="mt-12 text-center text-sm text-gray-500"><p>Merci pour votre achat !</p></div>
            </div>
            <div className="flex justify-end space-x-2 p-6 bg-gray-50 rounded-b-2xl no-print">
                <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-gray-600 bg-gray-200 hover:bg-gray-300">Fermer</button>
                {canShare && (
                    <button onClick={handleSharePDF} className="flex items-center px-4 py-2 rounded-lg text-white bg-blue-600 hover:bg-blue-700 font-semibold"><Share2 size={18} className="mr-2" /> Partager</button>
                )}
                <button onClick={handleDownloadPDF} className="flex items-center px-4 py-2 rounded-lg text-white bg-green-600 hover:bg-green-700 font-semibold"><FileText size={18} className="mr-2" /> PDF</button>
                <button onClick={handlePrint} className="flex items-center px-4 py-2 rounded-lg text-white bg-gray-500 hover:bg-gray-600 font-semibold"><Printer size={18} className="mr-2" /> Imprimer</button>
            </div>
        </div>
    );
};


const CompanyProfileForm = ({ onSubmit, initialData }) => {
    const [name, setName] = useState(initialData?.name || '');
    const [address, setAddress] = useState(initialData?.address || '');
    const [phone, setPhone] = useState(initialData?.phone || '');
    const [logo, setLogo] = useState(initialData?.logo || null);

    const handleLogoChange = async (e) => {
        const file = e.target.files[0];
        if (file) {
            try {
                const resizedImage = await resizeImage(file, 200, 200);
                setLogo(resizedImage);
            } catch (error) {
                console.error("Erreur de redimensionnement du logo:", error);
            }
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit({ name, address, phone, logo });
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="flex flex-col items-center space-y-2">
                <label className="w-full text-sm font-medium text-gray-700">Logo</label>
                <div className="w-32 h-32 rounded-lg bg-gray-100 flex items-center justify-center border-2 border-dashed">
                    {logo ? <img src={logo} alt="Aperçu du logo" className="w-full h-full object-contain rounded-lg"/> : <ImageIcon className="text-gray-400" size={40}/>}
                </div>
                <input type="file" accept="image/*" onChange={handleLogoChange} className="text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"/>
            </div>
            <FormField label="Nom de l'entreprise" type="text" value={name} onChange={e => setName(e.target.value)} required />
            <FormField label="Adresse" type="text" value={address} onChange={e => setAddress(e.target.value)} />
            <FormField label="Téléphone" type="tel" value={phone} onChange={e => setPhone(e.target.value)} />
            <div className="flex justify-end pt-4">
                <button type="submit" className="px-6 py-2 rounded-lg text-white bg-blue-500 hover:bg-blue-600 font-semibold">Enregistrer</button>
            </div>
        </form>
    );
};

const PaymentForm = ({ onSubmit, sale, customers, onClose }) => {
    const customer = useMemo(() => customers.find(c => c.id === sale.customerId), [customers, sale]);
    const remainingBalance = sale.totalPrice - (sale.paidAmount || 0);
    const [amount, setAmount] = useState(remainingBalance);
    const [paymentType, setPaymentType] = useState(PAYMENT_TYPES[0]);

    useEffect(() => {
        if (paymentType === 'Crédit Client' && customer?.balance) {
            setAmount(Math.min(remainingBalance, customer.balance));
        } else {
            setAmount(remainingBalance);
        }
    }, [paymentType, customer, remainingBalance]);

    const handleSubmit = (e) => { e.preventDefault(); onSubmit(amount, paymentType); };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <h3 className="text-2xl font-bold text-center text-gray-800">Faire un Paiement</h3>
            <div className="p-4 bg-gray-50 rounded-lg space-y-1">
                <p><strong>Client:</strong> {sale.customerName}</p>
                <p className="font-bold text-red-600">Solde Restant: {remainingBalance.toLocaleString()} F CFA</p>
            </div>
            <FormField 
                label="Montant Payé" 
                type="number" 
                value={amount} 
                onChange={e => setAmount(e.target.value)} 
                required 
                min="1" 
                max={paymentType === 'Crédit Client' ? Math.min(remainingBalance, customer?.balance || 0) : remainingBalance} 
            />
            <FormSelect label="Méthode de paiement" value={paymentType} onChange={e => setPaymentType(e.target.value)} required>
                {PAYMENT_TYPES.filter(p => p !== 'Créance').filter(p => p !== 'Crédit Client' || (customer && customer.balance > 0)).map(type => 
                    <option key={type} value={type}>
                        {type} {type === 'Crédit Client' && `(Disponible: ${(customer?.balance || 0).toLocaleString()} F CFA)`}
                    </option>
                )}
            </FormSelect>
            <div className="flex justify-end space-x-4 pt-4">
                <button type="button" onClick={onClose} className="px-6 py-2 rounded-lg text-gray-600 bg-gray-200 hover:bg-gray-300">Annuler</button>
                <button type="submit" className="px-6 py-2 rounded-lg text-white bg-green-500 hover:bg-green-600 font-semibold">Enregistrer Paiement</button>
            </div>
        </form>
    );
};

const FormField = ({ label, ...props }) => (
    <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
        <input {...props} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
    </div>
);

const FormSelect = ({ label, children, ...props }) => (
    <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
        <select {...props} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">{children}</select>
    </div>
);

const StatusBadge = ({ status }) => {
    const statusClasses = {
        [SALE_STATUS.COMPLETED]: 'bg-green-100 text-green-800',
        [SALE_STATUS.PARTIALLY_RETURNED]: 'bg-yellow-100 text-yellow-800',
        [SALE_STATUS.RETURNED]: 'bg-red-100 text-red-800',
        [SALE_STATUS.CREDIT]: 'bg-orange-100 text-orange-800',
        "Espèce": 'bg-blue-100 text-blue-800',
        "Wave": 'bg-cyan-100 text-cyan-800',
        "Orange Money": 'bg-orange-100 text-orange-800',
        "Crédit Client": 'bg-purple-100 text-purple-800'
    };
    return <span className={`px-2 py-1 text-xs font-semibold rounded-full capitalize ${statusClasses[status] || 'bg-gray-100 text-gray-800'}`}>{status}</span>;
};
