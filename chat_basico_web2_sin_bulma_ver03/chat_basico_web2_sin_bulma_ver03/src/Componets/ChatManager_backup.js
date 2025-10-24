import { useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { dbFirestore, storageFirebase, authFirebase } from '../connections/ConnFirestore';
import { addDoc, collection, doc, query, serverTimestamp, onSnapshot, orderBy, updateDoc, getDoc } from 'firebase/firestore';
import { ref, getDownloadURL, uploadBytesResumable } from 'firebase/storage';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';



function ChatManager() {

    const [dataMessages, setDataMessages] = useState([]);
    const [fileToStg, setFileToStg] = useState(null);
    const [connectedUsers, setConnectedUsers] = useState([]);
    const [usersLoaded, setUsersLoaded] = useState(false);
    const [currentUserData, setCurrentUserData] = useState(null);

    const location = useLocation();
    const { id, userName } = location.state || {};

    // Referencias de Firestore - se crearán dentro del useEffect para evitar dependencias

    // Función para cerrar sesión
    async function handleLogout() {
        try {
            console.log('🚪 [LOGOUT] Starting logout process...');
            
            // Actualizar estado del usuario a inactive antes de cerrar sesión
            if (id) {
                try {
                    const userDocRef = doc(dbFirestore, 'chatBasico', 'Users', 'regUsers', id);
                    await updateDoc(userDocRef, {
                        status: 'inactive',
                        lastSeen: serverTimestamp()
                    });
                    console.log('👤 [USER STATUS] User status updated to inactive before logout');
                } catch (statusError) {
                    console.log('⚠️ [USER STATUS] Could not update status before logout:', statusError);
                }
            }
            
            // Cerrar sesión de Firebase
            await signOut(authFirebase);
            console.log('✅ [LOGOUT] Firebase signOut successful');
            toast.success('Logged out successfully', { position: 'top-left', autoClose: 1500 });
            
            // Forzar redirección después de un breve delay
            setTimeout(() => {
                window.location.href = '/';
            }, 1000);
            
        } catch (error) {
            console.error('❌ [LOGOUT] Error during logout:', error);
            toast.error('Error logging out: ' + error.message, { position: 'top-left', autoClose: 3000 });
            
            // Intentar redirección de emergencia
            setTimeout(() => {
                window.location.href = '/';
            }, 2000);
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



    useEffect(() => {
        // Recupera y muestra la información recibida
        if (location.state) {
            console.log('Datos recibidos:', location.state);
        } else {
            console.log('No se recibieron datos');
        }
    }, [location.state]);

    // Forzar actualización de datos del usuario al montar el componente
    useEffect(() => {
        if (id) {
            console.log('🔄 [AVATAR] Forcing user data refresh on component mount for user:', id);
            
            // Cargar datos específicos del usuario inmediatamente
            const loadUserData = async () => {
                try {
                    const userDocRef = doc(dbFirestore, 'chatBasico', 'Users', 'regUsers', id);
                    const userDocSnap = await getDoc(userDocRef);
                    
                    if (userDocSnap.exists()) {
                        const userData = userDocSnap.data();
                        console.log('👤 [INITIAL LOAD] User data loaded:', {
                            id,
                            userName: userData.userName,
                            UrlAvatar: userData.UrlAvatar || 'No avatar',
                            status: userData.status,
                            hasAvatar: !!userData.UrlAvatar
                        });
                        
                        // Guardar datos del usuario actual
                        setCurrentUserData(userData);
                    } else {
                        console.log('⚠️ [INITIAL LOAD] User document not found for id:', id);
                    }
                } catch (error) {
                    console.error('❌ [INITIAL LOAD] Error loading user data:', error);
                }
            };
            
            loadUserData();
        }
    }, [id]);

    // Actualizar estado del usuario a 'active' cuando entra al chat (solo una vez)
    useEffect(() => {
        let hasUpdated = false;
        
        const updateUserStatus = async () => {
            if (id && !hasUpdated) {
                hasUpdated = true;
                try {
                    const userDocRef = doc(dbFirestore, 'chatBasico', 'Users', 'regUsers', id);
                    
                    // Verificar el estado actual antes de actualizar
                    const userDocSnap = await getDoc(userDocRef);
                    if (userDocSnap.exists()) {
                        const currentData = userDocSnap.data();
                        if (currentData.status !== 'active') {
                            await updateDoc(userDocRef, {
                                status: 'active',
                                lastSeen: serverTimestamp()
                            });
                            console.log('👤 [USER STATUS] User status updated to active on chat entry');
                        } else {
                            console.log('👤 [USER STATUS] User already active, skipping update');
                        }
                    }
                } catch (error) {
                    console.error('Error updating user status:', error);
                }
            }
        };
        
        updateUserStatus();
    }, [id]); // Incluir id pero con control de ejecución única

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

            // Preparar datos del mensaje (sin avatarUrl - se obtiene desde regUsers)
            const messageData = {
                userId: id,
                userName: userName,
                message: messageValue || '',
                timestamp: serverTimestamp()
            };
            
            console.log('📝 [MESSAGE DEBUG] Message data prepared (avatar from regUsers):', {
                userId: id,
                userName: userName,
                messageLength: messageValue.length
            });

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
            
            // Debug: Log messages (avatars now come from regUsers)
            console.log('💬 [MESSAGES] Messages received (avatars from regUsers):', messages.map(msg => ({
                id: msg.id,
                userName: msg.userName,
                userId: msg.userId,
                hasMessage: !!msg.message
            })));
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

    // useEffect para obtener lista de usuarios conectados en tiempo real
    useEffect(() => {
        console.log('👥 [FIREBASE READ] Initializing users listener at:', new Date().toISOString());
        
        const usersQuery = query(
            collection(dbFirestore, 'chatBasico', 'Users', 'regUsers'),
            orderBy('userName', 'asc')
        );
        
        const unsubscribeUsers = onSnapshot(usersQuery, (snapshot) => {
            // Solo procesar si hay cambios reales
            if (snapshot.metadata.fromCache) {
                console.log('👥 [FIREBASE READ] Skipping cache data');
                return;
            }
            
            const users = snapshot.docs.map((doc) => ({ 
                id: doc.id, 
                ...doc.data() 
            }));
            
            // Debug: Log all users data including avatars
            console.log('👥 [USERS DEBUG] Users loaded from Firestore:', users.map(user => ({
                id: user.id,
                userName: user.userName,
                UrlAvatar: user.UrlAvatar || 'No avatar',
                status: user.status,
                hasAvatar: !!user.UrlAvatar
            })));
            
            // Debug: Check current user specifically
            const currentUserInList = users.find(u => u.id === id);
            if (currentUserInList) {
                console.log('👤 [CURRENT USER] Found in users list:', {
                    id: currentUserInList.id,
                    userName: currentUserInList.userName,
                    UrlAvatar: currentUserInList.UrlAvatar || 'No avatar',
                    status: currentUserInList.status,
                    hasAvatar: !!currentUserInList.UrlAvatar
                });
            } else {
                console.log('❌ [CURRENT USER] Not found in users list. Looking for id:', id);
            }
            
            // Solo actualizar si hay cambios significativos
            setConnectedUsers(prevUsers => {
                const hasChanges = prevUsers.length !== users.length || 
                                 users.some(user => {
                                     const prevUser = prevUsers.find(p => p.id === user.id);
                                     return !prevUser || 
                                            prevUser.status !== user.status || 
                                            prevUser.userName !== user.userName ||
                                            prevUser.UrlAvatar !== user.UrlAvatar; // Detectar cambios en avatar
                                 });
                
                if (hasChanges) {
                    // Detectar cambios específicos de avatar para el usuario actual
                    const currentUser = users.find(u => u.id === id);
                    const prevCurrentUser = prevUsers.find(u => u.id === id);
                    
                    if (currentUser && prevCurrentUser && currentUser.UrlAvatar !== prevCurrentUser.UrlAvatar) {
                        console.log('🎭 [AVATAR] Avatar change detected for current user:', {
                            userId: id,
                            oldAvatar: prevCurrentUser.UrlAvatar || 'None',
                            newAvatar: currentUser.UrlAvatar || 'None',
                            timestamp: new Date().toISOString()
                        });
                    }
                    
                    console.log('👥 [FIREBASE READ] Users data updated:', {
                        usersCount: users.length,
                        activeUsers: users.filter(u => u.status === 'active').length,
                        inactiveUsers: users.filter(u => u.status === 'inactive').length,
                        timestamp: new Date().toISOString()
                    });
                    
                    setUsersLoaded(true); // Marcar usuarios como cargados
                    
                    // Actualizar datos locales del usuario actual si está en la lista
                    const updatedCurrentUser = users.find(u => u.id === id);
                    if (updatedCurrentUser) {
                        setCurrentUserData(updatedCurrentUser);
                        console.log('🔄 [USER UPDATE] Current user data updated from connectedUsers:', {
                            UrlAvatar: updatedCurrentUser.UrlAvatar || 'No avatar',
                            hasAvatar: !!updatedCurrentUser.UrlAvatar
                        });
                    }
                    
                    return users;
                }
                
                console.log('👥 [FIREBASE READ] No significant changes in users data');
                return prevUsers;
            });
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
    }, [id]); // Incluir id para detectar cambios de avatar del usuario actual


    return (
        <div id="mainContainer">
            <div id="userMessageSection" className="user-message-section">
                <h1>Welcome to the Chat, {userName}!</h1>
                
                {/* Avatar del usuario actual */}
                {(() => {
                    // Intentar obtener datos del usuario desde múltiples fuentes
                    const userFromConnectedList = connectedUsers.find(user => user.id === id);
                    const userAvatar = userFromConnectedList?.UrlAvatar || currentUserData?.UrlAvatar;
                    
                    console.log('🎭 [AVATAR] Current user avatar sources:', {
                        id,
                        userName,
                        usersLoaded,
                        connectedUsersLoaded: connectedUsers.length > 0,
                        userFromConnectedList: userFromConnectedList ? {
                            id: userFromConnectedList.id,
                            userName: userFromConnectedList.userName,
                            UrlAvatar: userFromConnectedList.UrlAvatar,
                            hasAvatar: !!userFromConnectedList.UrlAvatar,
                            status: userFromConnectedList.status
                        } : 'User not found in connectedUsers',
                        currentUserDataDirect: currentUserData ? {
                            userName: currentUserData.userName,
                            UrlAvatar: currentUserData.UrlAvatar,
                            hasAvatar: !!currentUserData.UrlAvatar
                        } : 'No direct user data',
                        finalAvatarToShow: userAvatar || 'No avatar',
                        connectedUsersCount: connectedUsers.length,
                        allUserIds: connectedUsers.map(u => u.id)
                    });
                    
                    // Determinar qué mostrar basado en el estado de carga
                    if (!usersLoaded && !currentUserData) {
                        return (
                            <div style={{ textAlign: 'center', padding: '10px', color: '#6c757d' }}>
                                Loading users...
                            </div>
                        );
                    }
                    
                    if (!userFromConnectedList && !currentUserData) {
                        console.log('⚠️ [AVATAR] User not found in any data source');
                        return (
                            <div style={{ textAlign: 'center', padding: '10px', color: '#dc3545' }}>
                                User not found in database
                            </div>
                        );
                    }
                    
                    if (!userAvatar) {
                        console.log('⚠️ [AVATAR] No UrlAvatar field in any data source');
                        return (
                            <div style={{ textAlign: 'center', padding: '10px', color: '#6c757d' }}>
                                No avatar set
                            </div>
                        );
                    }
                    
                    return (
                        <div style={{ 
                            textAlign: 'center', 
                            marginBottom: '15px',
                            padding: '10px',
                            backgroundColor: '#f8f9fa',
                            borderRadius: '10px',
                            border: '2px solid #e9ecef'
                        }}>
                            <img 
                                src={userAvatar} 
                                alt={`${userName}'s Avatar`} 
                                style={{ 
                                    width: '78px', 
                                    height: '78px', 
                                    borderRadius: '50%',
                                    border: '3px solid #007bff',
                                    boxShadow: '0 4px 10px rgba(0,123,255,0.3)'
                                }}
                                onError={(e) => {
                                    e.target.style.display = 'none';
                                    console.log('❌ [DEBUG] Error loading user avatar:', userAvatar);
                                }}
                                onLoad={() => {
                                    console.log('✅ [DEBUG] User avatar loaded successfully:', userAvatar);
                                }}
                            />
                        </div>
                    );
                })()}
                
                {/* Lista de usuarios conectados */}
                <div style={{
                    marginBottom: '20px',
                    padding: '15px',
                    backgroundColor: '#f8f9fa',
                    borderRadius: '10px',
                    border: '2px solid #e9ecef',
                    textAlign: 'left'
                }}>
                    <h3 style={{
                        margin: '0 0 15px 0',
                        fontSize: '16px',
                        color: '#495057',
                        textAlign: 'center'
                    }}>
                        👥 Users in Chat ({connectedUsers.filter((user, index, self) => 
                            index === self.findIndex(u => u.id === user.id)
                        ).length})
                    </h3>
                    
                    <div style={{
                        maxHeight: '150px',
                        overflowY: 'auto',
                        fontSize: '14px'
                    }}>
                        {connectedUsers.length === 0 ? (
                            <p style={{ 
                                textAlign: 'center', 
                                color: '#6c757d',
                                margin: '10px 0',
                                fontStyle: 'italic'
                            }}>
                                Loading users...
                            </p>
                        ) : (
                            connectedUsers
                                .filter((user, index, self) => 
                                    index === self.findIndex(u => u.id === user.id)
                                )
                                .map((user) => (
                                <div 
                                    key={user.id} 
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        padding: '8px',
                                        marginBottom: '5px',
                                        backgroundColor: user.id === id ? '#e3f2fd' : '#ffffff',
                                        borderRadius: '6px',
                                        border: user.id === id ? '1px solid #2196f3' : '1px solid #e9ecef'
                                    }}
                                >
                                    {/* Avatar pequeño */}
                                    {user.UrlAvatar && (
                                        <img 
                                            src={user.UrlAvatar} 
                                            alt={`${user.userName}'s avatar`}
                                            style={{
                                                width: '24px',
                                                height: '24px',
                                                borderRadius: '50%',
                                                marginRight: '8px',
                                                border: '1px solid #dee2e6'
                                            }}
                                            onError={(e) => {
                                                e.target.style.display = 'none';
                                            }}
                                        />
                                    )}
                                    
                                    {/* Nombre de usuario */}
                                    <span style={{
                                        flex: 1,
                                        fontWeight: user.id === id ? '600' : 'normal',
                                        color: user.id === id ? '#1976d2' : '#495057'
                                    }}>
                                        {user.userName} {user.id === id ? '(You)' : ''}
                                    </span>
                                    
                                    {/* Estado de conexión */}
                                    <span style={{
                                        fontSize: '12px',
                                        padding: '2px 8px',
                                        borderRadius: '12px',
                                        backgroundColor: user.status === 'active' ? '#d4edda' : '#f8d7da',
                                        color: user.status === 'active' ? '#155724' : '#721c24',
                                        border: user.status === 'active' ? '1px solid #c3e6cb' : '1px solid #f5c6cb'
                                    }}>
                                        {user.status === 'active' ? '🟢 Online' : '🔴 Offline'}
                                    </span>
                                </div>
                            ))
                        )}
                    </div>
                </div>
                
                <label>Your ID: {id}</label>
                <br />
                <label>Your User Name: {userName}</label>
                <br />
                <strong><label>Your Message:</label></strong>
                <br />
                <textarea id="usermessage" rows="4" cols="50" style={{ resize: 'vertical', width: '300px' }}></textarea>
                <br />
                <strong><label>Attach a file: </label></strong>
                <input id="fileInput" type="file" onChange={(e) => setFileToStg(e.target.files[0])} />
                <button onClick={handleSendMessage}>Send</button>
                <br /><br />
                <div style={{ textAlign: 'left', paddingLeft: '15px' }}>
                    <button onClick={handleLogout} style={{ marginBottom: '10px', backgroundColor: '#ff4444', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '3px', cursor: 'pointer' }}>
                        Logout
                    </button>
                </div>
            </div>
            <div id="messagesSection" className="messages-section">
                <h2>Messages:</h2>
                <ul>
                    {dataMessages.map((msg) => {
                        // Obtener avatar del usuario desde regUsers (fuente única de verdad)
                        const messageUser = connectedUsers.find(user => user.id === msg.userId);
                        const avatarToShow = messageUser?.UrlAvatar;
                        
                        console.log('🎭 [AVATAR] Avatar from regUsers for message:', {
                            msgId: msg.id,
                            userName: msg.userName,
                            userId: msg.userId,
                            userFound: !!messageUser,
                            avatarToShow: avatarToShow || 'No avatar'
                        });
                        
                        return (
                            <li key={msg.id} className="message-item">
                                {avatarToShow && (
                                    <img 
                                        src={avatarToShow}
                                        alt={`${msg.userName}'s avatar`} 
                                        className="avatar-img" 
                                        style={{ 
                                            width: '30px',
                                            height: '30px',
                                            borderRadius: '50%',
                                            marginRight: '10px',
                                            display: 'inline-block',
                                            verticalAlign: 'middle'
                                        }}
                                        onError={(e) => {
                                            e.target.style.display = 'none';
                                            console.log('❌ [AVATAR] Error loading avatar from regUsers:', avatarToShow, 'for user:', msg.userName);
                                        }}
                                        onLoad={() => {
                                            console.log('✅ [AVATAR] Avatar loaded from regUsers:', avatarToShow, 'for user:', msg.userName);
                                        }}
                                    />
                                )}
                                {!avatarToShow && console.log('⚠️ [AVATAR] No avatar in regUsers for user:', msg.userName, 'userId:', msg.userId)}
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
                        );
                    })}
                </ul>
            </div>
            <ToastContainer />
        </div>
    );
}



export default ChatManager;



