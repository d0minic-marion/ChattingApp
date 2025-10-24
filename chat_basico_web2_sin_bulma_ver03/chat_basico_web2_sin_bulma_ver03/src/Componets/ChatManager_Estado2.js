import { useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { dbFirestore, storageFirebase, authFirebase } from '../connections/ConnFirestore';
import { addDoc, collection, doc, query, serverTimestamp, onSnapshot, orderBy, updateDoc } from 'firebase/firestore';
import { ref, getDownloadURL, uploadBytesResumable } from 'firebase/storage';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';



function ChatManager() {

    const [dataMessages, setDataMessages] = useState([]);
    const [fileToStg, setFileToStg] = useState(null);
    const [connectedUsers, setConnectedUsers] = useState([]);

    const location = useLocation();
    const { id, userName, avatarUrl } = location.state || {};

    // Referencias de Firestore - se crearán dentro del useEffect para evitar dependencias

    // Función para cerrar sesión
    async function handleLogout() {
        try {
            // Actualizar estado del usuario a inactive antes de cerrar sesión
            if (id) {
                const userDocRef = doc(dbFirestore, 'chatBasico', 'Users', 'regUsers', id);
                await updateDoc(userDocRef, {
                    status: 'inactive',
                    lastSeen: serverTimestamp()
                });
                console.log('👤 [USER STATUS] User status updated to inactive before logout');
            }
            
            await signOut(authFirebase);
            toast.success('Logged out successfully', { position: 'top-left', autoClose: 1500 });
            // La redirección se manejará automáticamente por el estado de autenticación
        } catch (error) {
            console.error('Error logging out:', error);
            toast.error('Error logging out', { position: 'top-left', autoClose: 2000 });
        }
    }

    useEffect(() => {
        // Verificar el estado de autenticación
        const unsubscribeAuth = onAuthStateChanged(authFirebase, (user) => {
            if (!user) {
                // Usuario no autenticado, redirigir a la página de inicio
                window.location.href = '/';
            }
        });

        return () => unsubscribeAuth();
    }, []);

    // Efecto para actualizar el status del usuario actual a 'active' al entrar al chat
    useEffect(() => {
        if (id) {
            const updateUserStatus = async () => {
                try {
                    const userDocRef = doc(dbFirestore, 'chatBasico', 'Users', 'regUsers', id);
                    await updateDoc(userDocRef, {
                        status: 'active',
                        lastSeen: serverTimestamp()
                    });
                    console.log('👤 [USER STATUS] Current user status updated to active in chat');
                } catch (error) {
                    console.error('Error updating user status:', error);
                }
            };
            
            updateUserStatus();

            // Manejar cuando el usuario cierra la ventana/tab
            const handleBeforeUnload = async (event) => {
                try {
                    const userDocRef = doc(dbFirestore, 'chatBasico', 'Users', 'regUsers', id);
                    await updateDoc(userDocRef, {
                        status: 'inactive',
                        lastSeen: serverTimestamp()
                    });
                    console.log('👤 [USER STATUS] User status updated to inactive on page unload');
                } catch (error) {
                    console.error('Error updating user status on unload:', error);
                }
            };

            // Agregar event listener para beforeunload
            window.addEventListener('beforeunload', handleBeforeUnload);

            // Cleanup function
            return () => {
                window.removeEventListener('beforeunload', handleBeforeUnload);
                // También actualizar status a inactive al desmontar el componente
                const updateToInactive = async () => {
                    try {
                        const userDocRef = doc(dbFirestore, 'chatBasico', 'Users', 'regUsers', id);
                        await updateDoc(userDocRef, {
                            status: 'inactive',
                            lastSeen: serverTimestamp()
                        });
                        console.log('👤 [USER STATUS] User status updated to inactive on component unmount');
                    } catch (error) {
                        console.error('Error updating user status on unmount:', error);
                    }
                };
                updateToInactive();
            };
        }
    }, [id]);

    useEffect(() => {
        // Recupera y muestra la información recibida
        if (location.state) {
            console.log('Datos recibidos:', location.state);
        } else {
            console.log('No se recibieron datos');
        }
    }, [location.state]);

    // Función para enviar mensaje
    async function handleSendMessage() {
        const startTime = Date.now();
        console.log('🔄 [FIREBASE WRITE] Starting message send operation at:', new Date().toISOString());
        
        try {
            const messageValue = document.querySelector('#usermessage').value.trim();
            
            console.log('handleSendMessage called', { messageValue, fileToStg });
            
            // Validaciones básicas
            if (!messageValue && !fileToStg) {
                toast.error('Please enter a message or select a file to upload', { position: 'top-left', autoClose: 2000 });
                return;
            }

            if (!id || !userName) {
                toast.error('User information is missing. Please log in again.', { position: 'top-left', autoClose: 2000 });
                return;
            }

            // Crear referencias de Firestore
            const refChatBasico = collection(dbFirestore, 'chatBasico');
            const userDoc = doc(refChatBasico, 'Messages');
            const refUsers = collection(userDoc, 'regMessages');

            // Buscar avatar del usuario
            let avatarUrlToUse = avatarUrl || null;

            // Preparar datos del mensaje
            const messageData = {
                userId: id,
                userName: userName,
                message: messageValue || '',
                avatarUrl: avatarUrlToUse,
                timestamp: serverTimestamp()
            };

            console.log('📝 [FIREBASE WRITE] Message data prepared:', {
                dataSize: JSON.stringify(messageData).length + ' bytes',
                hasFile: !!fileToStg,
                messageLength: messageValue.length,
                timestamp: new Date().toISOString()
            });

            // Si hay archivo, subirlo primero
            if (fileToStg) {
                console.log('📁 [FIREBASE STORAGE] Starting file upload:', {
                    fileName: fileToStg.name,
                    fileSize: fileToStg.size + ' bytes',
                    fileType: fileToStg.type,
                    timestamp: new Date().toISOString()
                });
                const downloadURL = await handleUploadFileToStg(fileToStg);
                messageData.url = downloadURL;
                messageData.fileName = fileToStg.name;
                console.log('✅ [FIREBASE STORAGE] File uploaded successfully:', {
                    downloadURL: downloadURL,
                    fileName: fileToStg.name,
                    timestamp: new Date().toISOString()
                });
            }

            // Enviar mensaje a Firestore
            console.log('💾 [FIREBASE WRITE] Sending message to Firestore...', messageData);
            await addDoc(refUsers, messageData);
            
            const endTime = Date.now();
            console.log('✅ [FIREBASE WRITE] Message sent successfully:', {
                totalTime: (endTime - startTime) + 'ms',
                finalDataSize: JSON.stringify(messageData).length + ' bytes',
                timestamp: new Date().toISOString()
            });
            
            // Mostrar confirmación
            if (fileToStg && messageValue) {
                toast.success('Message with file sent!', { position: 'top-left', autoClose: 1500 });
            } else if (fileToStg) {
                toast.success('File sent!', { position: 'top-left', autoClose: 1500 });
            } else {
                toast.success('Message sent!', { position: 'top-left', autoClose: 1500 });
            }

            // Limpiar formulario
            document.querySelector('#usermessage').value = '';
            if (fileToStg) {
                document.querySelector('#fileInput').value = '';
                setFileToStg(null);
            }
            
        } catch (error) {
            console.error('Error in handleSendMessage:', error);
            toast.error('Error sending message', { position: 'top-left', autoClose: 2000 });
        }
    }

    function handleUploadFileToStg(fileToBeStg) {
        console.log('🔄 [FIREBASE STORAGE] Starting upload process:', {
            fileName: fileToBeStg.name,
            fileSize: fileToBeStg.size + ' bytes',
            fileType: fileToBeStg.type,
            timestamp: new Date().toISOString()
        });
        
        return new Promise((resolve, reject) => {
            const storageRef = ref(storageFirebase, 'chatFiles/' + fileToBeStg.name);
            const uploadTask = uploadBytesResumable(storageRef, fileToBeStg);
            
            uploadTask.on('state_changed',
                (snapshot) => {
                    const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                    console.log('📊 [FIREBASE STORAGE] Upload progress:', {
                        progress: progress.toFixed(2) + '%',
                        bytesTransferred: snapshot.bytesTransferred,
                        totalBytes: snapshot.totalBytes,
                        timestamp: new Date().toISOString()
                    });
                    toast.info(`Upload is ${progress.toFixed(2)}% done`, { position: 'top-left', autoClose: 1000 });
                },
                (error) => {
                    console.error('❌ [FIREBASE STORAGE] Upload error:', {
                        error: error.message,
                        fileName: fileToBeStg.name,
                        timestamp: new Date().toISOString()
                    });
                    toast.error('Error uploading file', { position: 'top-left', autoClose: 2000 });
                    reject(error);
                },
                () => {
                    getDownloadURL(uploadTask.snapshot.ref).then((downloadURL) => {
                        console.log('✅ [FIREBASE STORAGE] Upload completed:', {
                            fileName: fileToBeStg.name,
                            fileSize: fileToBeStg.size + ' bytes',
                            downloadURL: downloadURL,
                            timestamp: new Date().toISOString()
                        });
                        toast.success('File uploaded successfully', { position: 'top-left', autoClose: 1500 });
                        resolve(downloadURL);
                    });
                }
            );
        });
    }


    function downloadStorageFile(file) {
        if (!file.url) {
            toast.error('File URL not available', { position: 'top-right', autoClose: 2000 });
            return;
        }

        try {
            const link = document.createElement('a');
            link.href = file.url;
            link.download = file.fileName || 'archivo'; // Usa el nombre real si está disponible
            link.target = '_blank'; // Abrir en nueva pestaña como fallback
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            toast.success(`Download started: ${file.fileName || 'archivo'}`, { position: 'top-right', autoClose: 1500 });
        } catch (error) {
            console.error('Error downloading file:', error);
            toast.error('Error starting download', { position: 'top-right', autoClose: 2000 });
        }
    }



    function getAvatarImage(avatarUrl, messageId) {
        const imgElem = document.getElementById(`avatarImg-${messageId}`);
        if (!imgElem) {
            console.log('⚠️ [AVATAR LOADER] Image element not found for messageId:', messageId);
            return;
        }

        if (!avatarUrl) {
            // Si no hay avatar, usar una imagen por defecto o dejar vacío
            imgElem.src = '';
            imgElem.style.display = 'none';
            return;
        }

        // Si la URL ya es una URL completa (desde Firebase Auth), usarla directamente
        if (avatarUrl.startsWith('http')) {
            console.log('🖼️ [FIREBASE STORAGE] Using direct avatar URL:', {
                messageId: messageId,
                avatarUrl: avatarUrl,
                timestamp: new Date().toISOString()
            });
            imgElem.src = avatarUrl;
            imgElem.style.display = 'inline-block';
        } else {
            // Si es una referencia de Storage, obtener la URL de descarga
            console.log('🔄 [FIREBASE STORAGE] Fetching avatar download URL:', {
                messageId: messageId,
                storageRef: avatarUrl,
                timestamp: new Date().toISOString()
            });
            
            getDownloadURL(ref(storageFirebase, avatarUrl))
                .then((url) => {
                    console.log('✅ [FIREBASE STORAGE] Avatar URL fetched:', {
                        messageId: messageId,
                        downloadUrl: url,
                        timestamp: new Date().toISOString()
                    });
                    // Verificar que el elemento aún exista antes de asignar src
                    const currentImgElem = document.getElementById(`avatarImg-${messageId}`);
                    if (currentImgElem) {
                        currentImgElem.src = url;
                        currentImgElem.style.display = 'inline-block';
                    }
                })
                .catch((error) => {
                    console.log('❌ [FIREBASE STORAGE] Error fetching avatar URL:', {
                        messageId: messageId,
                        error: error.message,
                        storageRef: avatarUrl,
                        timestamp: new Date().toISOString()
                    });
                    // Verificar que el elemento aún exista antes de asignar src
                    const currentImgElem = document.getElementById(`avatarImg-${messageId}`);
                    if (currentImgElem) {
                        currentImgElem.src = '';
                        currentImgElem.style.display = 'none';
                    }
                });
        }
    }

    // Función para obtener avatar de usuario en la lista
    function getUserAvatarImage(avatarUrl, userId) {
        const imgElem = document.getElementById(`userAvatarImg-${userId}`);
        if (!imgElem) {
            console.log('⚠️ [AVATAR LOADER] User avatar image element not found for userId:', userId);
            return;
        }

        if (!avatarUrl) {
            // Si no hay avatar, mostrar icono por defecto
            imgElem.src = '';
            imgElem.style.display = 'none';
            return;
        }

        // Si la URL ya es una URL completa, usarla directamente
        if (avatarUrl.startsWith('http')) {
            imgElem.src = avatarUrl;
            imgElem.style.display = 'inline-block';
        } else {
            // Si es una referencia de Storage, obtener la URL de descarga
            getDownloadURL(ref(storageFirebase, avatarUrl))
                .then((url) => {
                    const currentImgElem = document.getElementById(`userAvatarImg-${userId}`);
                    if (currentImgElem) {
                        currentImgElem.src = url;
                        currentImgElem.style.display = 'inline-block';
                    }
                })
                .catch((error) => {
                    console.log('❌ [FIREBASE STORAGE] Error fetching user avatar URL:', {
                        userId: userId,
                        error: error.message
                    });
                    const currentImgElem = document.getElementById(`userAvatarImg-${userId}`);
                    if (currentImgElem) {
                        currentImgElem.src = '';
                        currentImgElem.style.display = 'none';
                    }
                });
        }
    }

    useEffect(() => {
        console.log('🚀 [FIREBASE READ] Initializing messages listener at:', new Date().toISOString());
        
        // Crear referencias de Firestore dentro del useEffect
        const refChatBasico = collection(dbFirestore, 'chatBasico');
        const userDoc = doc(refChatBasico, 'Messages');
        
        const messagesQuery = query(
            collection(userDoc, 'regMessages'), 
            orderBy('timestamp', 'asc')
        );
        
        console.log('📡 [FIREBASE READ] Setting up real-time listener for messages...');
        
        const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
            const messages = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
            
            // Calcular el tamaño de los datos recibidos
            const dataSize = JSON.stringify(messages).length;
            const docsReceived = snapshot.docs.length;
            
            console.log('📥 [FIREBASE READ] Messages data received:', {
                messagesCount: messages.length,
                documentsReceived: docsReceived,
                estimatedDataSize: dataSize + ' bytes',
                timestamp: new Date().toISOString(),
                fromCache: snapshot.metadata.fromCache,
                hasPendingWrites: snapshot.metadata.hasPendingWrites
            });
            
            // Analizar cambios en el snapshot
            const changes = snapshot.docChanges();
            if (changes.length > 0) {
                console.log('🔄 [FIREBASE READ] Document changes detected:', {
                    changesCount: changes.length,
                    changeTypes: changes.map(change => ({
                        type: change.type,
                        docId: change.doc.id
                    })),
                    timestamp: new Date().toISOString()
                });
            }
            
            setDataMessages(messages);
            
            // Procesar avatares después de que el DOM se actualice
            setTimeout(() => {
                let avatarFetches = 0;
                messages.forEach(msg => {
                    if (msg.avatarUrl) {
                        avatarFetches++;
                        getAvatarImage(msg.avatarUrl, msg.id);
                    }
                });
                
                if (avatarFetches > 0) {
                    console.log('🖼️ [FIREBASE STORAGE] Processing avatars after DOM update:', {
                        avatarRequests: avatarFetches,
                        timestamp: new Date().toISOString()
                    });
                }
            }, 100); // Esperar 100ms para que el DOM se actualice
        }, (error) => {
            console.error('❌ [FIREBASE READ] Error in messages listener:', {
                error: error.message,
                errorCode: error.code,
                timestamp: new Date().toISOString()
            });
            toast.error('Error loading messages', { position: 'top-left', autoClose: 2000 });
        });

        return () => {
            console.log('🛑 [FIREBASE READ] Cleaning up messages listener at:', new Date().toISOString());
            unsubscribe();
        };
    }, []); // Sin dependencias para evitar bucle infinito

    // Efecto para escuchar usuarios conectados en tiempo real
    useEffect(() => {
        console.log('🚀 [FIREBASE READ] Initializing users listener at:', new Date().toISOString());
        
        // Crear referencia a la colección de usuarios
        const refChatBasico = collection(dbFirestore, 'chatBasico');
        const usersDoc = doc(refChatBasico, 'Users');
        const usersQuery = collection(usersDoc, 'regUsers');
        
        console.log('📡 [FIREBASE READ] Setting up real-time listener for users...');
        
        const unsubscribeUsers = onSnapshot(usersQuery, (snapshot) => {
            const users = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
            
            // Calcular el tamaño de los datos recibidos
            const dataSize = JSON.stringify(users).length;
            const docsReceived = snapshot.docs.length;
            
            console.log('👥 [FIREBASE READ] Users data received:', {
                usersCount: users.length,
                documentsReceived: docsReceived,
                estimatedDataSize: dataSize + ' bytes',
                timestamp: new Date().toISOString(),
                fromCache: snapshot.metadata.fromCache,
                hasPendingWrites: snapshot.metadata.hasPendingWrites
            });
            
            // Analizar cambios en el snapshot de usuarios
            const changes = snapshot.docChanges();
            if (changes.length > 0) {
                console.log('🔄 [FIREBASE READ] User changes detected:', {
                    changesCount: changes.length,
                    changeTypes: changes.map(change => ({
                        type: change.type,
                        docId: change.doc.id,
                        userName: change.doc.data().userName,
                        status: change.doc.data().status
                    })),
                    timestamp: new Date().toISOString()
                });
            }
            
            // Separar usuarios activos e inactivos
            const activeUsers = users.filter(user => user.status === 'active');
            const inactiveUsers = users.filter(user => user.status !== 'active');
            
            console.log('👤 [USER STATUS] Users status summary:', {
                totalUsers: users.length,
                activeUsers: activeUsers.length,
                inactiveUsers: inactiveUsers.length,
                activeUserNames: activeUsers.map(u => u.userName),
                timestamp: new Date().toISOString()
            });
            
            setConnectedUsers(users);
            
        }, (error) => {
            console.error('❌ [FIREBASE READ] Error in users listener:', {
                error: error.message,
                errorCode: error.code,
                timestamp: new Date().toISOString()
            });
            toast.error('Error loading users list', { position: 'top-left', autoClose: 2000 });
        });

        return () => {
            console.log('🛑 [FIREBASE READ] Cleaning up users listener at:', new Date().toISOString());
            unsubscribeUsers();
        };
    }, []); // Sin dependencias para evitar bucle infinito

    // Efecto adicional para cargar avatares cuando cambian los mensajes
    useEffect(() => {
        if (dataMessages.length > 0) {
            console.log('🖼️ [AVATAR LOADER] Loading avatars for updated messages:', {
                messagesCount: dataMessages.length,
                timestamp: new Date().toISOString()
            });
            
            // Pequeño delay para asegurar que el DOM esté listo
            const timeoutId = setTimeout(() => {
                dataMessages.forEach(msg => {
                    if (msg.avatarUrl) {
                        const imgElem = document.getElementById(`avatarImg-${msg.id}`);
                        if (imgElem && !imgElem.src) {
                            // Solo cargar si el elemento existe y no tiene src
                            getAvatarImage(msg.avatarUrl, msg.id);
                        }
                    }
                });
            }, 50);
            
            return () => clearTimeout(timeoutId);
        }
    }, [dataMessages]); // Ejecutar cuando dataMessages cambie

    // Efecto para cargar avatares de usuarios cuando cambie la lista
    useEffect(() => {
        if (connectedUsers.length > 0) {
            console.log('👥 [AVATAR LOADER] Loading avatars for users list:', {
                usersCount: connectedUsers.length,
                timestamp: new Date().toISOString()
            });
            
            // Pequeño delay para asegurar que el DOM esté listo
            const timeoutId = setTimeout(() => {
                connectedUsers.forEach(user => {
                    if (user.UrlAvatar) {
                        getUserAvatarImage(user.UrlAvatar, user.id);
                    }
                });
            }, 100);
            
            return () => clearTimeout(timeoutId);
        }
    }, [connectedUsers]); // Ejecutar cuando connectedUsers cambie


    return (
        <div id="mainContainer">
            <div id="userMessageSection" className="user-message-section">
                <h1>Welcome to the Chat, {userName}!</h1>
                <label>Your ID: {id}</label>
                <br />
                <label>Your User Name: {userName}</label>
                <br />
                <button onClick={handleLogout} style={{ marginBottom: '10px', backgroundColor: '#ff4444', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '3px', cursor: 'pointer' }}>
                    Logout
                </button>
                <br />
                <strong><label>Your Message:</label></strong>
                <br />
                <textarea id="usermessage" rows="4" cols="50" style={{ resize: 'vertical', width: '300px' }}></textarea>
                <br />
                <strong><label>Attach a file: </label></strong>
                <input id="fileInput" type="file" onChange={(e) => setFileToStg(e.target.files[0])} />
                <button onClick={handleSendMessage}>Send</button>
            </div>
            <div id="usersSection" className="users-section">
                <h2>👥 Users in Chat ({connectedUsers.length})</h2>
                <div className="users-list">
                    {connectedUsers.length > 0 ? (
                        <>
                            {/* Usuarios activos */}
                            {connectedUsers.filter(user => user.status === 'active').length > 0 && (
                                <div className="active-users">
                                    <h3 style={{ color: '#28a745', fontSize: '1.1em', marginBottom: '10px' }}>🟢 Online ({connectedUsers.filter(user => user.status === 'active').length})</h3>
                                    <ul style={{ listStyle: 'none', padding: '0' }}>
                                        {connectedUsers
                                            .filter(user => user.status === 'active')
                                            .map(user => (
                                                <li key={user.id} className="user-item" style={{ marginBottom: '8px', padding: '5px', backgroundColor: '#e8f5e8', borderRadius: '5px', display: 'flex', alignItems: 'center' }}>
                                                    <img 
                                                        id={`userAvatarImg-${user.id}`}
                                                        src="" 
                                                        alt="avatar" 
                                                        className="user-avatar-img" 
                                                        style={{ 
                                                            display: 'none',
                                                            width: '25px', 
                                                            height: '25px', 
                                                            borderRadius: '50%', 
                                                            marginRight: '8px',
                                                            objectFit: 'cover'
                                                        }}
                                                    />
                                                    <span style={{ fontSize: '1.1em' }}>👤</span>
                                                    <strong style={{ marginLeft: '8px', color: '#155724' }}>{user.userName}</strong>
                                                    {user.id === id && <span style={{ marginLeft: '8px', fontSize: '0.8em', color: '#155724' }}>(You)</span>}
                                                </li>
                                            ))
                                        }
                                    </ul>
                                </div>
                            )}
                            
                            {/* Usuarios inactivos */}
                            {connectedUsers.filter(user => user.status !== 'active').length > 0 && (
                                <div className="inactive-users" style={{ marginTop: '15px' }}>
                                    <h3 style={{ color: '#6c757d', fontSize: '1.1em', marginBottom: '10px' }}>⚫ Offline ({connectedUsers.filter(user => user.status !== 'active').length})</h3>
                                    <ul style={{ listStyle: 'none', padding: '0' }}>
                                        {connectedUsers
                                            .filter(user => user.status !== 'active')
                                            .map(user => (
                                                <li key={user.id} className="user-item" style={{ marginBottom: '5px', padding: '3px', backgroundColor: '#f8f9fa', borderRadius: '3px', display: 'flex', alignItems: 'center', opacity: '0.7' }}>
                                                    <img 
                                                        id={`userAvatarImg-${user.id}`}
                                                        src="" 
                                                        alt="avatar" 
                                                        className="user-avatar-img" 
                                                        style={{ 
                                                            display: 'none',
                                                            width: '20px', 
                                                            height: '20px', 
                                                            borderRadius: '50%', 
                                                            marginRight: '6px',
                                                            objectFit: 'cover'
                                                        }}
                                                    />
                                                    <span style={{ fontSize: '0.9em' }}>👤</span>
                                                    <span style={{ marginLeft: '6px', color: '#6c757d' }}>{user.userName}</span>
                                                    {user.lastSeen && (
                                                        <span style={{ marginLeft: '8px', fontSize: '0.7em', color: '#999' }}>
                                                            Last seen: {user.lastSeen.toDate ? user.lastSeen.toDate().toLocaleString() : 'Unknown'}
                                                        </span>
                                                    )}
                                                </li>
                                            ))
                                        }
                                    </ul>
                                </div>
                            )}
                        </>
                    ) : (
                        <p style={{ color: '#6c757d', fontStyle: 'italic' }}>No users found...</p>
                    )}
                </div>
            </div>
            <div id="messagesSection" className="messages-section">
                <h2>Messages:</h2>
                <ul>
                    {dataMessages.map((msg) => (
                        <li key={msg.id} className="message-item">
                            <img 
                                id={`avatarImg-${msg.id}`} 
                                src="" 
                                alt="avatar" 
                                className="avatar-img" 
                                style={{ display: 'none' }}
                            />
                            <strong>{msg.userName}:</strong> 
                            {msg.message && <span> {msg.message}</span>}
                            {msg.url && (
                                <div style={{ marginTop: '5px' }}>
                                    {!msg.message && <span> shared a file</span>}
                                    <button 
                                        onClick={() => downloadStorageFile(msg)} 
                                        className="download-btn"
                                        style={{ marginLeft: '10px' }}
                                    >
                                        📁 Download: {msg.fileName || 'file'}
                                    </button>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            </div>
            <ToastContainer />
        </div>
    );
}



export default ChatManager;



