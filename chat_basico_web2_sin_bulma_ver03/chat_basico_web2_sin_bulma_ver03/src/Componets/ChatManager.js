import { useLocation } from 'react-router-dom';
import { useEffect, useState, useCallback, useRef } from 'react';
import { dbFirestore, storageFirebase, authFirebase } from '../connections/ConnFirestore';
import { addDoc, collection, doc, query, serverTimestamp, onSnapshot, orderBy, updateDoc, getDoc, setDoc, where, deleteDoc } from 'firebase/firestore';
import { ref, getDownloadURL, uploadBytesResumable } from 'firebase/storage';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';



function ChatManager() {

    const [dataMessages, setDataMessages] = useState([]);
    const [fileToStg, setFileToStg] = useState(null);
    const [connectedUsers, setConnectedUsers] = useState([]);
    
    // Estados para chat personal
    const [activePrivateChat, setActivePrivateChat] = useState(null); // Chat privado activo
    const [privateChatMessages, setPrivateChatMessages] = useState([]);
    const [privateChatFile, setPrivateChatFile] = useState(null);
    const [chatRequests, setChatRequests] = useState([]); // Solicitudes de chat recibidas
    const [sentRequestResponses, setSentRequestResponses] = useState([]); // Para las respuestas a solicitudes enviadas
    
    // Estados para el sistema de drag
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [windowPosition, setWindowPosition] = useState({ x: 0, y: 0 });
    
    // Estados para el sistema de redimensionamiento
    const [isResizing, setIsResizing] = useState(false);
    const [resizeDirection, setResizeDirection] = useState('');
    const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0, windowX: 0, windowY: 0 });
    const [windowSize, setWindowSize] = useState({ width: 845, height: 585 });
    
    // Estados para la ventana del chat general
    const [showGeneralChatWindow, setShowGeneralChatWindow] = useState(true);
    const [generalChatPosition, setGeneralChatPosition] = useState({ 
        x: Math.max(0, window.innerWidth - 970), // Lado derecho optimizado para pantalla completa
        y: 20 // Posición más alta para aprovechar todo el espacio
    });
    const [generalChatSize, setGeneralChatSize] = useState({ width: 910, height: 650 });
    const [isGeneralChatDragging, setIsGeneralChatDragging] = useState(false);
    const [isGeneralChatResizing, setIsGeneralChatResizing] = useState(false);
    const [generalChatResizeDirection, setGeneralChatResizeDirection] = useState('');
    const [generalChatDragStart, setGeneralChatDragStart] = useState({ x: 0, y: 0 });
    const [generalChatResizeStart, setGeneralChatResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0, windowX: 0, windowY: 0 });

    const location = useLocation();
    const { id, userName, avatarUrl } = location.state || {};

    // Referencias para auto-scroll
    const privateChatMessagesRef = useRef(null);
    const generalChatMessagesRef = useRef(null);

    // Función para generar ID único de chat personal
    function generatePrivateChatId(userId1, userId2) {
        // Ordenar los IDs alfabéticamente para consistencia
        const sortedIds = [userId1, userId2].sort();
        return `${sortedIds[0]}<-   ->${sortedIds[1]}`;
    }

    // Función para verificar si existe un chat entre dos usuarios
    const checkExistingPrivateChat = useCallback(async (userId1, userId2) => {
        const chatId1 = `${userId1}<-   ->${userId2}`;
        const chatId2 = `${userId2}<-   ->${userId1}`;
        
        try {
            const refChatBasico = collection(dbFirestore, 'chatBasico');
            const privateChatsDoc = doc(refChatBasico, 'PrivateChats');
            
            // Verificar ambas posibles combinaciones
            const chatDoc1 = await getDoc(doc(privateChatsDoc, 'chats', chatId1));
            const chatDoc2 = await getDoc(doc(privateChatsDoc, 'chats', chatId2));
            
            if (chatDoc1.exists()) {
                return { exists: true, chatId: chatId1 };
            } else if (chatDoc2.exists()) {
                return { exists: true, chatId: chatId2 };
            } else {
                return { exists: false, chatId: generatePrivateChatId(userId1, userId2) };
            }
        } catch (error) {
            console.error('Error checking existing private chat:', error);
            return { exists: false, chatId: generatePrivateChatId(userId1, userId2) };
        }
    }, []);

    // Referencias de Firestore - se crearán dentro del useEffect para evitar dependencias

    // Función para enviar solicitud de chat personal
    async function sendChatRequest(targetUserId, targetUserName, targetUserAvatar) {
        console.log('🔥 [DEBUG] sendChatRequest called with:', { targetUserId, targetUserName, targetUserAvatar, currentUserId: id });
        
        try {
            const refChatBasico = collection(dbFirestore, 'chatBasico');
            const requestsDoc = doc(refChatBasico, 'ChatRequests');
            const requestsCollection = collection(requestsDoc, 'requests');
            
            const requestData = {
                fromUserId: id,
                fromUserName: userName,
                fromUserAvatar: avatarUrl || null, // Convertir undefined a null
                toUserId: targetUserId,
                toUserName: targetUserName,
                toUserAvatar: targetUserAvatar || null, // Convertir undefined a null
                timestamp: serverTimestamp(),
                status: 'pending'
            };
            
            console.log('📤 [CHAT REQUEST] Sending request data:', requestData);
            await addDoc(requestsCollection, requestData);
            toast.success(`Chat request sent to ${targetUserName}`, { position: 'top-right', autoClose: 2000 });
            console.log('💬 [CHAT REQUEST] Request sent successfully:', requestData);
        } catch (error) {
            console.error('❌ [CHAT REQUEST] Error sending chat request:', error);
            toast.error('Error sending chat request', { position: 'top-right', autoClose: 2000 });
        }
    }
    
    // Función para responder a solicitud de chat
    async function respondToChatRequest(requestId, response, fromUserId, fromUserName, fromUserAvatar) {
        try {
            const refChatBasico = collection(dbFirestore, 'chatBasico');
            const requestsDoc = doc(refChatBasico, 'ChatRequests');
            const requestDoc = doc(requestsDoc, 'requests', requestId);
            
            // Actualizar el estado de la solicitud
            await updateDoc(requestDoc, {
                status: response,
                respondedAt: serverTimestamp()
            });
            
            if (response === 'accepted') {
                // Iniciar chat privado para el usuario que acepta
                await startPrivateChat(fromUserId, fromUserName, fromUserAvatar);
                
                // Notificar al solicitante que su solicitud fue aceptada
                // y que debe abrir su ventana de chat también
                await notifyUserToOpenChat(fromUserId, id, userName);
                
                toast.success(`Chat started with ${fromUserName}`, { position: 'top-right', autoClose: 2000 });
            } else {
                const responseMessages = {
                    'rejected': 'Chat request rejected',
                    'postponed': 'Chat request postponed',
                    'busy': 'User is busy with another chat'
                };
                toast.info(responseMessages[response], { position: 'top-right', autoClose: 2000 });
            }
            
            console.log('📝 [CHAT REQUEST] Response sent:', { requestId, response });
        } catch (error) {
            console.error('Error responding to chat request:', error);
            toast.error('Error responding to request', { position: 'top-right', autoClose: 2000 });
        }
    }
    
    // Función para notificar al usuario solicitante que abra el chat
    async function notifyUserToOpenChat(targetUserId, currentUserId, currentUserName) {
        try {
            const refChatBasico = collection(dbFirestore, 'chatBasico');
            const notificationsDoc = doc(refChatBasico, 'ChatNotifications');
            const notificationsCollection = collection(notificationsDoc, 'notifications');
            
            const notificationData = {
                toUserId: targetUserId,
                fromUserId: currentUserId,
                fromUserName: currentUserName,
                type: 'open_chat',
                timestamp: serverTimestamp(),
                read: false
            };
            
            await addDoc(notificationsCollection, notificationData);
            console.log('📬 [CHAT NOTIFICATION] Open chat notification sent to:', targetUserId);
        } catch (error) {
            console.error('Error sending chat notification:', error);
        }
    }
    
    // Función para iniciar chat privado
    async function startPrivateChat(targetUserId, targetUserName, targetUserAvatar) {
        try {
            const { exists, chatId } = await checkExistingPrivateChat(id, targetUserId);
            
            if (!exists) {
                // Crear nuevo chat privado
                const refChatBasico = collection(dbFirestore, 'chatBasico');
                const privateChatsDoc = doc(refChatBasico, 'PrivateChats');
                const chatDoc = doc(privateChatsDoc, 'chats', chatId);
                
                await setDoc(chatDoc, {
                    participants: [id, targetUserId],
                    participantNames: [userName, targetUserName],
                    participantAvatars: [avatarUrl || null, targetUserAvatar || null], // Convertir undefined a null
                    createdAt: serverTimestamp(),
                    lastActivity: serverTimestamp(),
                    windowsOpen: {} // Tracking de ventanas abiertas
                });
                
                console.log('💬 [PRIVATE CHAT] New chat created:', chatId);
            }
            
            // Registrar que este usuario abrió la ventana
            await updateChatWindowStatus(chatId, id, true);
            
            // Activar el chat privado
            setActivePrivateChat({
                chatId: chatId,
                targetUserId: targetUserId,
                targetUserName: targetUserName,
                targetUserAvatar: targetUserAvatar
            });
            
            console.log('💬 [PRIVATE CHAT] Chat activated:', { chatId, targetUserName });
        } catch (error) {
            console.error('Error starting private chat:', error);
            toast.error('Error starting private chat', { position: 'top-right', autoClose: 2000 });
        }
    }
    
    // Función para actualizar el estado de ventana abierta/cerrada
    async function updateChatWindowStatus(chatId, userId, isOpen) {
        try {
            const refChatBasico = collection(dbFirestore, 'chatBasico');
            const privateChatsDoc = doc(refChatBasico, 'PrivateChats');
            const chatDoc = doc(privateChatsDoc, 'chats', chatId);
            
            const updateData = {};
            updateData[`windowsOpen.${userId}`] = isOpen;
            
            await updateDoc(chatDoc, updateData);
            console.log('🪟 [WINDOW STATUS] Updated for user:', userId, 'isOpen:', isOpen);
        } catch (error) {
            console.error('Error updating window status:', error);
        }
    }
    
    // Función para cerrar chat privado
    async function closePrivateChat() {
        if (!activePrivateChat) return;
        
        const chatId = activePrivateChat.chatId;
        const targetUserId = activePrivateChat.targetUserId;
        
        try {
            // Actualizar estado de ventana cerrada
            await updateChatWindowStatus(chatId, id, false);
            
            // Notificar al otro usuario que cierre su ventana también
            await notifyUserToCloseChat(targetUserId, id);
            
            // Cerrar ventana local
            setActivePrivateChat(null);
            setPrivateChatMessages([]);
            setPrivateChatFile(null);
            
            console.log('💬 [PRIVATE CHAT] Chat closed and notification sent to:', targetUserId);
        } catch (error) {
            console.error('Error closing private chat:', error);
            // Cerrar localmente aunque haya error
            setActivePrivateChat(null);
            setPrivateChatMessages([]);
            setPrivateChatFile(null);
        }
    }
    
    // Función para notificar al otro usuario que cierre el chat
    async function notifyUserToCloseChat(targetUserId, currentUserId) {
        try {
            const refChatBasico = collection(dbFirestore, 'chatBasico');
            const notificationsDoc = doc(refChatBasico, 'ChatNotifications');
            const notificationsCollection = collection(notificationsDoc, 'notifications');
            
            const notificationData = {
                toUserId: targetUserId,
                fromUserId: currentUserId,
                type: 'close_chat',
                timestamp: serverTimestamp(),
                read: false
            };
            
            await addDoc(notificationsCollection, notificationData);
            console.log('📪 [CHAT NOTIFICATION] Close chat notification sent to:', targetUserId);
        } catch (error) {
            console.error('Error sending close chat notification:', error);
        }
    }
    
    // Función para enviar mensaje en chat privado
    async function handleSendPrivateMessage() {
        if (!activePrivateChat) return;
        
        const startTime = Date.now();
        console.log('🔄 [PRIVATE CHAT] Starting private message send operation at:', new Date().toISOString());
        
        try {
            const messageValue = document.querySelector('#privateChatMessage').value.trim();
            
            // Validaciones básicas
            if (!messageValue && !privateChatFile) {
                toast.error('Please enter a message or select a file', { position: 'top-right', autoClose: 2000 });
                return;
            }
            
            // Crear referencias de Firestore
            const refChatBasico = collection(dbFirestore, 'chatBasico');
            const privateChatsDoc = doc(refChatBasico, 'PrivateChats');
            const chatDoc = doc(privateChatsDoc, 'chats', activePrivateChat.chatId);
            const messagesCollection = collection(chatDoc, 'messages');
            
            // Preparar datos del mensaje
            const messageData = {
                senderId: id,
                senderName: userName,
                message: messageValue || '',
                timestamp: serverTimestamp(),
                avatarUrl: avatarUrl || null // Convertir undefined a null
            };
            
            // Si hay archivo, subirlo primero
            if (privateChatFile) {
                console.log('📁 [PRIVATE CHAT] Starting file upload:', {
                    fileName: privateChatFile.name,
                    fileSize: privateChatFile.size + ' bytes'
                });
                const downloadURL = await handleUploadPrivateFileToStg(privateChatFile);
                messageData.url = downloadURL;
                messageData.fileName = privateChatFile.name;
            }
            
            // Enviar mensaje
            await addDoc(messagesCollection, messageData);
            
            // Actualizar última actividad del chat
            await updateDoc(chatDoc, {
                lastActivity: serverTimestamp()
            });
            
            const endTime = Date.now();
            console.log('✅ [PRIVATE CHAT] Private message sent successfully:', {
                totalTime: (endTime - startTime) + 'ms',
                chatId: activePrivateChat.chatId
            });
            
            // Limpiar formulario
            document.querySelector('#privateChatMessage').value = '';
            if (privateChatFile) {
                document.querySelector('#privateChatFileInput').value = '';
                setPrivateChatFile(null);
            }
            
            toast.success('Private message sent!', { position: 'top-right', autoClose: 1000 });
            
        } catch (error) {
            console.error('Error sending private message:', error);
            toast.error('Error sending private message', { position: 'top-right', autoClose: 2000 });
        }
    }
    
    // Función para subir archivos en chat privado
    function handleUploadPrivateFileToStg(fileToBeStg) {
        return new Promise((resolve, reject) => {
            const storageRef = ref(storageFirebase, `privateChatFiles/${activePrivateChat.chatId}/${fileToBeStg.name}`);
            const uploadTask = uploadBytesResumable(storageRef, fileToBeStg);
            
            uploadTask.on('state_changed',
                (snapshot) => {
                    const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                    toast.info(`Private file upload: ${progress.toFixed(2)}% done`, { position: 'top-right', autoClose: 1000 });
                },
                (error) => {
                    console.error('❌ [PRIVATE CHAT] Upload error:', error);
                    toast.error('Error uploading private file', { position: 'top-right', autoClose: 2000 });
                    reject(error);
                },
                () => {
                    getDownloadURL(uploadTask.snapshot.ref).then((downloadURL) => {
                        console.log('✅ [PRIVATE CHAT] File uploaded successfully:', downloadURL);
                        resolve(downloadURL);
                    });
                }
            );
        });
    }

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
    
    // Funciones para el sistema de drag
    const handleMouseDown = (e) => {
        setIsDragging(true);
        setDragStart({
            x: e.clientX - windowPosition.x,
            y: e.clientY - windowPosition.y
        });
        console.log('🔄 [DRAG] Started dragging chat window');
    };
    
    const handleMouseMove = useCallback((e) => {
        if (!isDragging) return;
        
        const newX = e.clientX - dragStart.x;
        const newY = e.clientY - dragStart.y;
        
        // Permitir movimiento por toda la pantalla
        const maxX = window.innerWidth - 50; // Solo dejar 50px de margen para mantener visibilidad
        const maxY = window.innerHeight - 50; // Solo dejar 50px de margen para mantener visibilidad
        
        const limitedX = Math.max(-200, Math.min(newX, maxX)); // Permitir salir parcialmente (-200px)
        const limitedY = Math.max(-50, Math.min(newY, maxY));   // Permitir salir parcialmente (-50px)
        
        setWindowPosition({ x: limitedX, y: limitedY });
    }, [isDragging, dragStart]);
    
    const handleMouseUp = useCallback(() => {
        if (isDragging) {
            setIsDragging(false);
            console.log('✓ [DRAG] Finished dragging chat window at position:', windowPosition);
        }
        if (isResizing) {
            setIsResizing(false);
            console.log('✓ [RESIZE] Finished resizing chat window to:', windowSize);
        }
    }, [isDragging, isResizing, windowPosition, windowSize]);
    
    // Funciones para el sistema de redimensionamiento
    const handleResizeStart = (e, direction) => {
        console.log('🎯 [DEBUG RESIZE START] Handle resize start called:', { direction, clientX: e.clientX, clientY: e.clientY });
        e.preventDefault();
        e.stopPropagation();
        setIsResizing(true);
        setResizeDirection(direction);
        setResizeStart({
            x: e.clientX,
            y: e.clientY,
            width: windowSize.width,
            height: windowSize.height,
            windowX: windowPosition.x,
            windowY: windowPosition.y
        });
        console.log('🔄 [RESIZE] Started resizing chat window in direction:', direction);
    };
    
    const handleResizeMove = (e) => {
        if (!isResizing) return;
        
        console.log('🔄 [DEBUG RESIZE] Resize move triggered:', { 
            isResizing, 
            direction: resizeDirection,
            clientX: e.clientX,
            clientY: e.clientY,
            resizeStart
        });
        
        const deltaX = e.clientX - resizeStart.x;
        const deltaY = e.clientY - resizeStart.y;
        
        let newWidth = resizeStart.width;
        let newHeight = resizeStart.height;
        let newX = resizeStart.windowX;
        let newY = resizeStart.windowY;
        
        // Calcular nuevas dimensiones y posición según la dirección - Sin límites máximos
        switch (resizeDirection) {
            case 'se': // esquina inferior derecha
                newWidth = Math.max(320, resizeStart.width + deltaX);
                newHeight = Math.max(240, resizeStart.height + deltaY);
                break;
            case 'sw': // esquina inferior izquierda
                newWidth = Math.max(320, resizeStart.width - deltaX);
                newHeight = Math.max(240, resizeStart.height + deltaY);
                newX = Math.min(resizeStart.windowX + deltaX, resizeStart.windowX + resizeStart.width - 320);
                break;
            case 'e': // lado derecho
                newWidth = Math.max(320, resizeStart.width + deltaX);
                break;
            case 'w': // lado izquierdo
                newWidth = Math.max(320, resizeStart.width - deltaX);
                newX = Math.min(resizeStart.windowX + deltaX, resizeStart.windowX + resizeStart.width - 320);
                break;
            case 's': // lado inferior
                newHeight = Math.max(240, resizeStart.height + deltaY);
                break;
            case 'n': // lado superior
                newHeight = Math.max(240, resizeStart.height - deltaY);
                newY = Math.min(resizeStart.windowY + deltaY, resizeStart.windowY + resizeStart.height - 240);
                break;
            default:
                // Por defecto, comportamiento de esquina inferior derecha
                newWidth = Math.max(320, resizeStart.width + deltaX);
                newHeight = Math.max(240, resizeStart.height + deltaY);
                break;
        }
        
        // Sin límites máximos - permitir cualquier tamaño
        // Los límites ahora son solo los mínimos definidos en el switch
        
        // Limitar posición para no salir completamente de pantalla (muy permisivo)
        newX = Math.max(-500, Math.min(newX, window.innerWidth + 200));
        newY = Math.max(-300, Math.min(newY, window.innerHeight + 200));
        
        console.log('🔄 [DEBUG RESIZE] Setting new size:', { 
            newWidth, 
            newHeight, 
            newX, 
            newY,
            currentWindowSize: windowSize,
            currentWindowPosition: windowPosition
        });
        
        setWindowSize({ width: newWidth, height: newHeight });
        setWindowPosition({ x: newX, y: newY });
    };
    
    const handleGlobalMouseMove = useCallback((e) => {
        handleMouseMove(e);
        handleResizeMove(e);
    }, [handleMouseMove, handleResizeMove]);
    
    // Effect para manejar eventos globales de mouse
    useEffect(() => {
        if (isDragging || isResizing) {
            document.addEventListener('mousemove', handleGlobalMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        }
        
        return () => {
            document.removeEventListener('mousemove', handleGlobalMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, isResizing, handleGlobalMouseMove, handleMouseUp]);
    
    // Resetear posición de la ventana cuando se abre un nuevo chat
    useEffect(() => {
        if (activePrivateChat) {
            // Posición inicial en el lado izquierdo inferior
            const initialX = 50; // Lado izquierdo
            const initialY = Math.max(50, window.innerHeight - 650); // Lado inferior con más espacio para tamaño 30% mayor
            setWindowPosition({ x: initialX, y: initialY });
        }
    }, [activePrivateChat]); // Solo resetear cuando cambie el chat activo
    
    // Funciones para el sistema de drag y resize del chat general
    const handleGeneralChatMouseDown = (e) => {
        setIsGeneralChatDragging(true);
        setGeneralChatDragStart({
            x: e.clientX - generalChatPosition.x,
            y: e.clientY - generalChatPosition.y
        });
        console.log('🔄 [GENERAL CHAT DRAG] Started dragging general chat window');
    };
    
    const handleGeneralChatMouseMove = useCallback((e) => {
        if (!isGeneralChatDragging) return;
        
        const newX = e.clientX - generalChatDragStart.x;
        const newY = e.clientY - generalChatDragStart.y;
        
        const maxX = window.innerWidth - 50; // Solo dejar 50px de margen para mantener visibilidad
        const maxY = window.innerHeight - 50; // Solo dejar 50px de margen para mantener visibilidad
        
        const limitedX = Math.max(-200, Math.min(newX, maxX)); // Permitir salir parcialmente (-200px)
        const limitedY = Math.max(-50, Math.min(newY, maxY));   // Permitir salir parcialmente (-50px)
        
        setGeneralChatPosition({ x: limitedX, y: limitedY });
    }, [isGeneralChatDragging, generalChatDragStart]);
    
    const handleGeneralChatMouseUp = useCallback(() => {
        if (isGeneralChatDragging) {
            setIsGeneralChatDragging(false);
            console.log('✓ [GENERAL CHAT DRAG] Finished dragging at position:', generalChatPosition);
        }
        if (isGeneralChatResizing) {
            setIsGeneralChatResizing(false);
            console.log('✓ [GENERAL CHAT RESIZE] Finished resizing to:', generalChatSize);
        }
    }, [isGeneralChatDragging, isGeneralChatResizing, generalChatPosition, generalChatSize]);
    
    const handleGeneralChatResizeStart = (e, direction) => {
        e.preventDefault();
        e.stopPropagation();
        setIsGeneralChatResizing(true);
        setGeneralChatResizeDirection(direction);
        setGeneralChatResizeStart({
            x: e.clientX,
            y: e.clientY,
            width: generalChatSize.width,
            height: generalChatSize.height,
            windowX: generalChatPosition.x,
            windowY: generalChatPosition.y
        });
        console.log('🔄 [GENERAL CHAT RESIZE] Started resizing in direction:', direction);
    };
    
    const handleGeneralChatResizeMove = useCallback((e) => {
        if (!isGeneralChatResizing) return;
        
        const deltaX = e.clientX - generalChatResizeStart.x;
        const deltaY = e.clientY - generalChatResizeStart.y;
        
        let newWidth = generalChatResizeStart.width;
        let newHeight = generalChatResizeStart.height;
        let newX = generalChatResizeStart.windowX;
        let newY = generalChatResizeStart.windowY;
        
        // Calcular nuevas dimensiones y posición según la dirección - Sin límites máximos
        switch (generalChatResizeDirection) {
            case 'se': // esquina inferior derecha
                newWidth = Math.max(320, generalChatResizeStart.width + deltaX);
                newHeight = Math.max(240, generalChatResizeStart.height + deltaY);
                break;
            case 'sw': // esquina inferior izquierda
                newWidth = Math.max(320, generalChatResizeStart.width - deltaX);
                newHeight = Math.max(240, generalChatResizeStart.height + deltaY);
                newX = Math.min(generalChatResizeStart.windowX + deltaX, generalChatResizeStart.windowX + generalChatResizeStart.width - 320);
                break;
            case 'e': // lado derecho
                newWidth = Math.max(320, generalChatResizeStart.width + deltaX);
                break;
            case 'w': // lado izquierdo
                newWidth = Math.max(320, generalChatResizeStart.width - deltaX);
                newX = Math.min(generalChatResizeStart.windowX + deltaX, generalChatResizeStart.windowX + generalChatResizeStart.width - 320);
                break;
            case 's': // lado inferior
                newHeight = Math.max(240, generalChatResizeStart.height + deltaY);
                break;
            case 'n': // lado superior
                newHeight = Math.max(240, generalChatResizeStart.height - deltaY);
                newY = Math.min(generalChatResizeStart.windowY + deltaY, generalChatResizeStart.windowY + generalChatResizeStart.height - 240);
                break;
            default:
                // Por defecto, comportamiento de esquina inferior derecha
                newWidth = Math.max(320, generalChatResizeStart.width + deltaX);
                newHeight = Math.max(240, generalChatResizeStart.height + deltaY);
                break;
        }
        
        // Sin límites máximos - permitir cualquier tamaño
        // Los límites ahora son solo los mínimos definidos en el switch
        
        // Limitar posición para no salir completamente de pantalla (muy permisivo)
        newX = Math.max(-500, Math.min(newX, window.innerWidth + 200));
        newY = Math.max(-300, Math.min(newY, window.innerHeight + 200));
        
        setGeneralChatSize({ width: newWidth, height: newHeight });
        setGeneralChatPosition({ x: newX, y: newY });
    }, [isGeneralChatResizing, generalChatResizeDirection, generalChatResizeStart]);
    
    const handleGeneralChatGlobalMouseMove = useCallback((e) => {
        handleGeneralChatMouseMove(e);
        handleGeneralChatResizeMove(e);
    }, [handleGeneralChatMouseMove, handleGeneralChatResizeMove]);
    
    // Effect para manejar eventos globales del chat general
    useEffect(() => {
        if (isGeneralChatDragging || isGeneralChatResizing) {
            document.addEventListener('mousemove', handleGeneralChatGlobalMouseMove);
            document.addEventListener('mouseup', handleGeneralChatMouseUp);
        }
        
        return () => {
            document.removeEventListener('mousemove', handleGeneralChatGlobalMouseMove);
            document.removeEventListener('mouseup', handleGeneralChatMouseUp);
        };
    }, [isGeneralChatDragging, isGeneralChatResizing, handleGeneralChatGlobalMouseMove, handleGeneralChatMouseUp]);
    
    // Resetear posición del General Chat cuando se abre
    useEffect(() => {
        if (showGeneralChatWindow) {
            // Posición inicial en el lado derecho superior
            const initialX = Math.max(50, window.innerWidth - 975); // Lado derecho con margen para tamaño 30% mayor
            const initialY = 50; // Parte superior
            setGeneralChatPosition({ x: initialX, y: initialY });
        }
    }, [showGeneralChatWindow]);

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
    
    // Función para obtener avatar en chat privado
    function getPrivateAvatarImage(avatarUrl, messageId) {
        const imgElem = document.getElementById(`privateAvatarImg-${messageId}`);
        if (!imgElem) return;

        if (!avatarUrl) {
            imgElem.src = '';
            imgElem.style.display = 'none';
            return;
        }

        if (avatarUrl.startsWith('http')) {
            imgElem.src = avatarUrl;
            imgElem.style.display = 'inline-block';
        } else {
            getDownloadURL(ref(storageFirebase, avatarUrl))
                .then((url) => {
                    const currentImgElem = document.getElementById(`privateAvatarImg-${messageId}`);
                    if (currentImgElem) {
                        currentImgElem.src = url;
                        currentImgElem.style.display = 'inline-block';
                    }
                })
                .catch((error) => {
                    console.log('❌ [PRIVATE CHAT] Error fetching private avatar URL:', error);
                    const currentImgElem = document.getElementById(`privateAvatarImg-${messageId}`);
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
    
    // Efecto para escuchar solicitudes de chat
    useEffect(() => {
        if (!id) return;
        
        console.log('🚀 [CHAT REQUESTS] Initializing chat requests listener');
        
        const refChatBasico = collection(dbFirestore, 'chatBasico');
        const requestsDoc = doc(refChatBasico, 'ChatRequests');
        const requestsQuery = query(
            collection(requestsDoc, 'requests'),
            where('toUserId', '==', id),
            where('status', '==', 'pending')
        );
        
        const unsubscribeRequests = onSnapshot(requestsQuery, (snapshot) => {
            const requests = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
            setChatRequests(requests);
            
            console.log('📨 [CHAT REQUESTS] Requests received:', {
                requestsCount: requests.length,
                requests: requests.map(r => ({ from: r.fromUserName, to: r.toUserName }))
            });
        }, (error) => {
            console.error('❌ [CHAT REQUESTS] Error in requests listener:', error);
        });
        
        return () => {
            console.log('🛑 [CHAT REQUESTS] Cleaning up requests listener');
            unsubscribeRequests();
        };
    }, [id]);

    // Efecto para escuchar respuestas a solicitudes enviadas
    useEffect(() => {
        if (!id) return;
        
        console.log('🚀 [SENT REQUESTS] Initializing sent requests listener');
        
        const refChatBasico = collection(dbFirestore, 'chatBasico');
        const requestsDoc = doc(refChatBasico, 'ChatRequests');
        const sentRequestsQuery = query(
            collection(requestsDoc, 'requests'),
            where('fromUserId', '==', id),
            where('status', 'in', ['accepted', 'rejected', 'postponed', 'busy'])
        );
        
        const unsubscribeSentRequests = onSnapshot(sentRequestsQuery, (snapshot) => {
            const responses = snapshot.docs.map((doc) => ({ 
                id: doc.id, 
                ...doc.data(),
                receivedAt: new Date() // Agregar timestamp de cuando se recibió
            }));
            setSentRequestResponses(responses);
            
            console.log('📤 [SENT REQUESTS] Responses received:', {
                responsesCount: responses.length,
                responses: responses.map(r => ({ to: r.toUserName, status: r.status, respondedAt: r.respondedAt }))
            });
        }, (error) => {
            console.error('❌ [SENT REQUESTS] Error in sent requests listener:', error);
        });
        
        return () => {
            console.log('🛑 [SENT REQUESTS] Cleaning up sent requests listener');
            unsubscribeSentRequests();
        };
    }, [id]);

    // Efecto para auto-eliminar respuestas después de 5 segundos
    useEffect(() => {
        if (sentRequestResponses.length === 0) return;

        const timers = sentRequestResponses.map(response => {
            if (response.receivedAt) {
                const timeToHide = 5000 - (new Date() - response.receivedAt);
                
                if (timeToHide > 0) {
                    return setTimeout(async () => {
                        try {
                            // Eliminar de Firestore
                            const refChatBasico = collection(dbFirestore, 'chatBasico');
                            const requestsDoc = doc(refChatBasico, 'ChatRequests');
                            const requestDocRef = doc(requestsDoc, 'requests', response.id);
                            
                            await deleteDoc(requestDocRef);
                            
                            console.log('🗑️ [AUTO-DELETE] Response deleted from Firestore after 5 seconds:', response.id);
                        } catch (error) {
                            console.error('❌ [AUTO-DELETE] Error deleting response from Firestore:', error);
                        }
                    }, timeToHide);
                } else {
                    // Si ya pasaron más de 5 segundos, eliminar inmediatamente
                    setTimeout(async () => {
                        try {
                            const refChatBasico = collection(dbFirestore, 'chatBasico');
                            const requestsDoc = doc(refChatBasico, 'ChatRequests');
                            const requestDocRef = doc(requestsDoc, 'requests', response.id);
                            
                            await deleteDoc(requestDocRef);
                            
                            console.log('🗑️ [AUTO-DELETE] Expired response deleted immediately from Firestore:', response.id);
                        } catch (error) {
                            console.error('❌ [AUTO-DELETE] Error deleting expired response from Firestore:', error);
                        }
                    }, 0);
                    return null;
                }
            }
            return null;
        }).filter(timer => timer !== null);

        return () => {
            timers.forEach(timer => clearTimeout(timer));
        };
    }, [sentRequestResponses]);
    
    // Efecto para escuchar notificaciones de chat (abrir/cerrar)
    useEffect(() => {
        if (!id) return;
        
        console.log('🚀 [CHAT NOTIFICATIONS] Initializing notifications listener');
        
        const refChatBasico = collection(dbFirestore, 'chatBasico');
        const notificationsDoc = doc(refChatBasico, 'ChatNotifications');
        const notificationsQuery = query(
            collection(notificationsDoc, 'notifications'),
            where('toUserId', '==', id),
            where('read', '==', false)
        );
        
        const unsubscribeNotifications = onSnapshot(notificationsQuery, async (snapshot) => {
            const notifications = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
            
            for (const notification of notifications) {
                console.log('📬 [CHAT NOTIFICATION] Received:', notification);
                
                if (notification.type === 'open_chat') {
                    // Abrir chat automáticamente
                    const targetUser = connectedUsers.find(user => user.id === notification.fromUserId);
                    if (targetUser) {
                        // Crear la función inline para evitar dependencias
                        const { exists, chatId } = await checkExistingPrivateChat(id, notification.fromUserId);
                        
                        if (!exists) {
                            const refChatBasico = collection(dbFirestore, 'chatBasico');
                            const privateChatsDoc = doc(refChatBasico, 'PrivateChats');
                            const chatDoc = doc(privateChatsDoc, 'chats', chatId);
                            
                            await setDoc(chatDoc, {
                                participants: [id, notification.fromUserId],
                                participantNames: [userName, notification.fromUserName || targetUser.userName],
                                participantAvatars: [avatarUrl || null, targetUser.avatarUrl || null], // Manejar undefined
                                createdAt: serverTimestamp(),
                                lastActivity: serverTimestamp(),
                                windowsOpen: {}
                            });
                        }
                        
                        await updateChatWindowStatus(chatId, id, true);
                        setActivePrivateChat({
                            chatId: chatId,
                            targetUserId: notification.fromUserId,
                            targetUserName: notification.fromUserName || targetUser.userName,
                            targetUserAvatar: targetUser.avatarUrl || null // Incluir avatar
                        });
                        
                        toast.success(`Chat opened with ${notification.fromUserName}`, { position: 'top-right', autoClose: 2000 });
                    }
                } else if (notification.type === 'close_chat') {
                    // Cerrar chat si está abierto con ese usuario
                    if (activePrivateChat && activePrivateChat.targetUserId === notification.fromUserId) {
                        setActivePrivateChat(null);
                        setPrivateChatMessages([]);
                        setPrivateChatFile(null);
                        toast.info('Chat closed by other user', { position: 'top-right', autoClose: 2000 });
                    }
                }
                
                // Marcar notificación como leída
                const notificationDocRef = doc(refChatBasico, 'ChatNotifications', 'notifications', notification.id);
                await updateDoc(notificationDocRef, { read: true });
            }
        }, (error) => {
            console.error('❌ [CHAT NOTIFICATIONS] Error in notifications listener:', error);
        });
        
        return () => {
            console.log('🛑 [CHAT NOTIFICATIONS] Cleaning up notifications listener');
            unsubscribeNotifications();
        };
    }, [id, connectedUsers, activePrivateChat, userName, avatarUrl, checkExistingPrivateChat]); // Incluir todas las dependencias necesarias
    
    // Efecto para escuchar mensajes del chat privado activo
    useEffect(() => {
        if (!activePrivateChat) {
            setPrivateChatMessages([]);
            return;
        }
        
        console.log('🚀 [PRIVATE CHAT] Initializing private chat listener:', activePrivateChat.chatId);
        
        const refChatBasico = collection(dbFirestore, 'chatBasico');
        const privateChatsDoc = doc(refChatBasico, 'PrivateChats');
        const chatDoc = doc(privateChatsDoc, 'chats', activePrivateChat.chatId);
        const messagesQuery = query(
            collection(chatDoc, 'messages'),
            orderBy('timestamp', 'asc')
        );
        
        const unsubscribePrivateMessages = onSnapshot(messagesQuery, (snapshot) => {
            const messages = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
            setPrivateChatMessages(messages);
            
            console.log('💬 [PRIVATE CHAT] Messages received:', {
                messagesCount: messages.length,
                chatId: activePrivateChat.chatId
            });
            
            // Cargar avatares para mensajes privados
            setTimeout(() => {
                messages.forEach(msg => {
                    if (msg.avatarUrl) {
                        getPrivateAvatarImage(msg.avatarUrl, msg.id);
                    }
                });
            }, 100);
        }, (error) => {
            console.error('❌ [PRIVATE CHAT] Error in private messages listener:', error);
        });
        
        return () => {
            console.log('🛑 [PRIVATE CHAT] Cleaning up private messages listener');
            unsubscribePrivateMessages();
        };
    }, [activePrivateChat]);

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

    // Auto-scroll para mensajes de chat privado
    useEffect(() => {
        if (privateChatMessagesRef.current) {
            privateChatMessagesRef.current.scrollTop = privateChatMessagesRef.current.scrollHeight;
        }
    }, [privateChatMessages]);

    // Auto-scroll para mensajes de chat general
    useEffect(() => {
        if (generalChatMessagesRef.current) {
            generalChatMessagesRef.current.scrollTop = generalChatMessagesRef.current.scrollHeight;
        }
    }, [dataMessages]);


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
                {!showGeneralChatWindow && (
                    <button 
                        onClick={() => setShowGeneralChatWindow(true)} 
                        style={{ 
                            marginBottom: '10px', 
                            marginLeft: '10px',
                            backgroundColor: '#28a745', 
                            color: 'white', 
                            border: 'none', 
                            padding: '5px 10px', 
                            borderRadius: '3px', 
                            cursor: 'pointer',
                            fontSize: '0.9em'
                        }}
                        title="Open General Chat Window"
                    >
                        💬 Open General Chat
                    </button>
                )}
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
                                                <li key={user.id} className="user-item" style={{ marginBottom: '8px', padding: '5px', backgroundColor: '#e8f5e8', borderRadius: '5px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                    <div 
                                                        style={{ 
                                                            display: 'flex', 
                                                            alignItems: 'center', 
                                                            flex: 1, 
                                                            cursor: user.id !== id ? 'pointer' : 'default',
                                                            padding: '2px'
                                                        }} 
                                                        onClick={(e) => {
                                                            console.log('🖱️ [DEBUG] Click event triggered');
                                                            console.log('🖱️ [DEBUG] User data:', { userId: user.id, userName: user.userName, currentId: id });
                                                            console.log('🖱️ [DEBUG] Is clickable:', user.id !== id);
                                                            
                                                            if (user.id !== id) {
                                                                console.log('🖱️ [DEBUG] Calling sendChatRequest...');
                                                                sendChatRequest(user.id, user.userName);
                                                            } else {
                                                                console.log('🖱️ [DEBUG] Click ignored - same user');
                                                            }
                                                        }}
                                                    >
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
                                                        <strong style={{ marginLeft: '0px', color: '#155724' }}>{user.userName}</strong>
                                                        {user.id === id && <span style={{ marginLeft: '8px', fontSize: '0.8em', color: '#155724' }}>(You)</span>}
                                                        {user.id !== id && (
                                                            <button 
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    console.log('🔘 [DEBUG] Button clicked for user:', user.userName);
                                                                    sendChatRequest(user.id, user.userName);
                                                                }}
                                                                style={{
                                                                    marginLeft: '10px',
                                                                    fontSize: '0.7em',
                                                                    padding: '2px 6px',
                                                                    backgroundColor: '#007bff',
                                                                    color: 'white',
                                                                    border: 'none',
                                                                    borderRadius: '3px',
                                                                    cursor: 'pointer'
                                                                }}
                                                                title="Send Chat Request"
                                                            >
                                                                💬
                                                            </button>
                                                        )}
                                                    </div>
                                                    {/* Mostrar botones de respuesta si hay solicitud pendiente */}
                                                    {chatRequests.find(req => req.fromUserId === user.id) && (
                                                        <div style={{ display: 'flex', gap: '3px', marginLeft: '5px' }}>
                                                            <button 
                                                                onClick={() => {
                                                                    const request = chatRequests.find(req => req.fromUserId === user.id);
                                                                    respondToChatRequest(request.id, 'accepted', user.id, user.userName, user.avatarUrl);
                                                                }}
                                                                style={{ fontSize: '0.7em', padding: '2px 4px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer' }}
                                                                title="Accept"
                                                            >
                                                                ✓
                                                            </button>
                                                            <button 
                                                                onClick={() => {
                                                                    const request = chatRequests.find(req => req.fromUserId === user.id);
                                                                    respondToChatRequest(request.id, 'rejected', user.id, user.userName, user.avatarUrl);
                                                                }}
                                                                style={{ fontSize: '0.7em', padding: '2px 4px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer' }}
                                                                title="Reject"
                                                            >
                                                                ✗
                                                            </button>
                                                            <button 
                                                                onClick={() => {
                                                                    const request = chatRequests.find(req => req.fromUserId === user.id);
                                                                    respondToChatRequest(request.id, 'postponed', user.id, user.userName, user.avatarUrl);
                                                                }}
                                                                style={{ fontSize: '0.7em', padding: '2px 4px', backgroundColor: '#ffc107', color: 'black', border: 'none', borderRadius: '3px', cursor: 'pointer' }}
                                                                title="Later"
                                                            >
                                                                ⏰
                                                            </button>
                                                            <button 
                                                                onClick={() => {
                                                                    const request = chatRequests.find(req => req.fromUserId === user.id);
                                                                    respondToChatRequest(request.id, 'busy', user.id, user.userName, user.avatarUrl);
                                                                }}
                                                                style={{ fontSize: '0.7em', padding: '2px 4px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer' }}
                                                                title="Busy"
                                                            >
                                                                💼
                                                            </button>
                                                        </div>
                                                    )}
                                                    
                                                    {/* Mostrar respuesta a solicitud enviada si existe */}
                                                    {(() => {
                                                        const sentResponse = sentRequestResponses.find(resp => resp.toUserId === user.id);
                                                        if (sentResponse) {
                                                            const statusMessages = {
                                                                'accepted': '✅ Accepted your chat request',
                                                                'rejected': '❌ Rejected your chat request',
                                                                'postponed': '⏰ Postponed your chat request',
                                                                'busy': '💼 Is busy with another chat'
                                                            };
                                                            const statusColors = {
                                                                'accepted': '#28a745',
                                                                'rejected': '#dc3545',
                                                                'postponed': '#ffc107',
                                                                'busy': '#6c757d'
                                                            };
                                                            return (
                                                                <div style={{ 
                                                                    marginTop: '4px', 
                                                                    marginLeft: '26px',
                                                                    padding: '3px 6px',
                                                                    backgroundColor: statusColors[sentResponse.status] + '20',
                                                                    border: `1px solid ${statusColors[sentResponse.status]}`,
                                                                    borderRadius: '4px',
                                                                    fontSize: '0.75em',
                                                                    color: statusColors[sentResponse.status],
                                                                    fontWeight: '500'
                                                                }}>
                                                                    {statusMessages[sentResponse.status]}
                                                                    {sentResponse.respondedAt && (
                                                                        <span style={{ marginLeft: '8px', fontSize: '0.9em', opacity: '0.7' }}>
                                                                            {sentResponse.respondedAt.toDate ? 
                                                                                sentResponse.respondedAt.toDate().toLocaleTimeString() : 
                                                                                'Just now'
                                                                            }
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            );
                                                        }
                                                        return null;
                                                    })()}
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
                                                <li key={user.id} className="user-item" style={{ marginBottom: '5px', padding: '3px', backgroundColor: '#f8f9fa', borderRadius: '3px', display: 'block', opacity: '0.7' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center' }}>
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
                                                        <span style={{ marginLeft: '0px', color: '#6c757d' }}>{user.userName}</span>
                                                        {user.lastSeen && (
                                                            <span style={{ marginLeft: '8px', fontSize: '0.7em', color: '#999' }}>
                                                                Last seen: {user.lastSeen.toDate ? user.lastSeen.toDate().toLocaleString() : 'Unknown'}
                                                            </span>
                                                        )}
                                                    </div>
                                                    
                                                    {/* Mostrar respuesta a solicitud enviada si existe */}
                                                    {(() => {
                                                        const sentResponse = sentRequestResponses.find(resp => resp.toUserId === user.id);
                                                        if (sentResponse) {
                                                            const statusMessages = {
                                                                'accepted': '✅ Accepted your chat request',
                                                                'rejected': '❌ Rejected your chat request',
                                                                'postponed': '⏰ Postponed your chat request',
                                                                'busy': '💼 Is busy with another chat'
                                                            };
                                                            const statusColors = {
                                                                'accepted': '#28a745',
                                                                'rejected': '#dc3545',
                                                                'postponed': '#ffc107',
                                                                'busy': '#6c757d'
                                                            };
                                                            return (
                                                                <div style={{ 
                                                                    marginTop: '4px', 
                                                                    marginLeft: '26px',
                                                                    padding: '3px 6px',
                                                                    backgroundColor: statusColors[sentResponse.status] + '20',
                                                                    border: `1px solid ${statusColors[sentResponse.status]}`,
                                                                    borderRadius: '4px',
                                                                    fontSize: '0.75em',
                                                                    color: statusColors[sentResponse.status],
                                                                    fontWeight: '500'
                                                                }}>
                                                                    {statusMessages[sentResponse.status]}
                                                                    {sentResponse.respondedAt && (
                                                                        <span style={{ marginLeft: '8px', fontSize: '0.9em', opacity: '0.7' }}>
                                                                            {sentResponse.respondedAt.toDate ? 
                                                                                sentResponse.respondedAt.toDate().toLocaleTimeString() : 
                                                                                'Just now'
                                                                            }
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            );
                                                        }
                                                        return null;
                                                    })()}
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
            
            {/* Sección de Chat Privado */}
            {activePrivateChat && (
                <div 
                    id="privateChatSection" 
                    className="private-chat-section" 
                    style={{ 
                        position: 'fixed', 
                        left: `${windowPosition.x}px`,
                        top: `${windowPosition.y}px`,
                        width: `${windowSize.width}px`,
                        height: `${windowSize.height}px`, 
                        backgroundColor: isResizing ? '#ffe6e6' : '#fff', // Cambiar color durante resize
                        border: '2px solid #007bff', 
                        borderRadius: '10px',
                        zIndex: 1000,
                        display: 'flex',
                        flexDirection: 'column',
                        boxShadow: (isDragging || isResizing) ? '0 10px 30px rgba(0,0,0,0.3)' : '0 5px 15px rgba(0,0,0,0.2)',
                        cursor: isDragging ? 'grabbing' : isResizing ? 'nw-resize' : 'default',
                        userSelect: 'none',
                        transition: (isDragging || isResizing) ? 'none' : 'box-shadow 0.2s ease',
                        minWidth: '300px',
                        minHeight: '200px',
                        maxWidth: '800px',
                        maxHeight: '600px'
                    }}
                >
                    {/* Header del chat privado - Área de drag */}
                    <div 
                        onMouseDown={handleMouseDown}
                        style={{ 
                            backgroundColor: '#007bff', 
                            color: 'white', 
                            padding: '10px 15px', 
                            borderRadius: '8px 8px 0 0',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            cursor: isDragging ? 'grabbing' : 'grab',
                            userSelect: 'none'
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                            {/* Avatar del usuario destinatario */}
                            <div style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '50%',
                                overflow: 'hidden',
                                border: '2px solid white',
                                marginRight: '10px',
                                flexShrink: 0
                            }}>
                                {activePrivateChat.targetUserAvatar ? (
                                    <img 
                                        src={activePrivateChat.targetUserAvatar} 
                                        alt={activePrivateChat.targetUserName}
                                        style={{
                                            width: '100%',
                                            height: '100%',
                                            objectFit: 'cover'
                                        }}
                                        onError={(e) => {
                                            e.target.style.display = 'none';
                                            e.target.nextSibling.style.display = 'flex';
                                        }}
                                    />
                                ) : null}
                                <div style={{
                                    width: '100%',
                                    height: '100%',
                                    backgroundColor: 'rgba(255,255,255,0.3)',
                                    color: 'white',
                                    display: activePrivateChat.targetUserAvatar ? 'none' : 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '14px',
                                    fontWeight: 'bold'
                                }}>
                                    {activePrivateChat.targetUserName.charAt(0).toUpperCase()}
                                </div>
                            </div>
                            
                            <div>
                                <h4 style={{ margin: '0', fontSize: '1em' }}>💬 Private Chat with {activePrivateChat.targetUserName}</h4>
                                <span style={{ fontSize: '0.75em', opacity: '0.8' }}>🔍 Drag to move • 📏 Resize handle</span>
                            </div>
                        </div>
                        <button 
                            onClick={closePrivateChat}
                            onMouseDown={(e) => e.stopPropagation()} // Evitar que inicie el drag al hacer click en cerrar
                            style={{ 
                                backgroundColor: 'transparent', 
                                border: 'none', 
                                color: 'white', 
                                fontSize: '1.2em', 
                                cursor: 'pointer',
                                padding: '0 5px',
                                borderRadius: '3px',
                                transition: 'background-color 0.2s ease'
                            }}
                            onMouseEnter={(e) => e.target.style.backgroundColor = 'rgba(255,255,255,0.2)'}
                            onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                            title="Close Chat"
                        >
                            ✗
                        </button>
                    </div>
                    
                    {/* Mensajes del chat privado */}
                    <div 
                        ref={privateChatMessagesRef}
                        style={{ 
                            flex: '1', 
                            overflowY: 'auto', 
                            padding: '10px', 
                            backgroundColor: '#f8f9fa',
                            minHeight: '120px',  // Altura mínima para el área de mensajes
                            overflow: 'auto' // Scroll cuando sea necesario
                        }}>
                        {privateChatMessages.length > 0 ? (
                            <ul style={{ listStyle: 'none', padding: '0', margin: '0' }}>
                                {privateChatMessages.map((msg) => (
                                    <li key={msg.id} style={{ 
                                        marginBottom: '12px', 
                                        padding: '10px', 
                                        backgroundColor: msg.senderId === id ? '#e3f2fd' : '#fff',
                                        borderRadius: '12px',
                                        border: '1px solid ' + (msg.senderId === id ? '#bbdefb' : '#e0e0e0'),
                                        maxWidth: '85%',
                                        marginLeft: msg.senderId === id ? 'auto' : '0',
                                        marginRight: msg.senderId === id ? '0' : 'auto'
                                    }}>
                                        <div style={{ 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            marginBottom: '6px',
                                            gap: '8px'
                                        }}>
                                            {/* Avatar del remitente */}
                                            <div style={{
                                                width: '28px',
                                                height: '28px',
                                                borderRadius: '50%',
                                                overflow: 'hidden',
                                                border: '2px solid ' + (msg.senderId === id ? '#1976d2' : '#388e3c'),
                                                flexShrink: 0
                                            }}>
                                                {msg.avatarUrl ? (
                                                    <img 
                                                        src={msg.avatarUrl} 
                                                        alt={msg.senderName}
                                                        style={{
                                                            width: '100%',
                                                            height: '100%',
                                                            objectFit: 'cover'
                                                        }}
                                                        onError={(e) => {
                                                            console.log('Avatar error for', msg.senderName, 'URL:', msg.avatarUrl);
                                                            e.target.style.display = 'none';
                                                            e.target.parentNode.querySelector('.avatar-fallback').style.display = 'flex';
                                                        }}
                                                    />
                                                ) : null}
                                                <div 
                                                    className="avatar-fallback"
                                                    style={{
                                                        width: '100%',
                                                        height: '100%',
                                                        backgroundColor: msg.senderId === id ? '#1976d2' : '#388e3c',
                                                        color: 'white',
                                                        display: msg.avatarUrl ? 'none' : 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontSize: '12px',
                                                        fontWeight: 'bold'
                                                    }}
                                                >
                                                    {msg.senderName ? msg.senderName.charAt(0).toUpperCase() : '?'}
                                                </div>
                                            </div>
                                            
                                            {/* Nombre del remitente y timestamp */}
                                            <div style={{ flex: 1 }}>
                                                <div style={{ 
                                                    fontWeight: 'bold', 
                                                    fontSize: '0.9em', 
                                                    color: msg.senderId === id ? '#1976d2' : '#388e3c'
                                                }}>
                                                    {msg.senderName}{msg.senderId === id ? ' (You)' : ''}
                                                </div>
                                                <div style={{ 
                                                    fontSize: '0.75em', 
                                                    color: '#6c757d',
                                                    marginTop: '2px'
                                                }}>
                                                    {msg.timestamp ? new Date(msg.timestamp.seconds * 1000).toLocaleTimeString() : 'Now'}
                                                </div>
                                            </div>
                                        </div>
                                        
                                        {/* Contenido del mensaje */}
                                        {msg.message && (
                                            <div style={{ 
                                                fontSize: '0.9em', 
                                                marginLeft: '36px',
                                                lineHeight: '1.4',
                                                color: '#333'
                                            }}>
                                                {msg.message}
                                            </div>
                                        )}
                                        
                                        {/* Archivo adjunto */}
                                        {msg.url && (
                                            <div style={{ marginLeft: '36px', marginTop: '8px' }}>
                                                <button 
                                                    onClick={() => downloadStorageFile(msg)}
                                                    style={{ 
                                                        fontSize: '0.8em', 
                                                        padding: '6px 12px', 
                                                        backgroundColor: '#17a2b8', 
                                                        color: 'white', 
                                                        border: 'none', 
                                                        borderRadius: '6px', 
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '6px',
                                                        transition: 'background-color 0.2s ease'
                                                    }}
                                                    onMouseEnter={(e) => e.target.style.backgroundColor = '#138496'}
                                                    onMouseLeave={(e) => e.target.style.backgroundColor = '#17a2b8'}
                                                >
                                                    📁 {msg.fileName || 'Download file'}
                                                </button>
                                            </div>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p style={{ textAlign: 'center', color: '#6c757d', fontStyle: 'italic', margin: '20px 0' }}>
                                No messages yet. Start the conversation!
                            </p>
                        )}
                    </div>
                    
                    {/* Formulario para enviar mensajes privados */}
                    <div style={{ 
                        padding: '10px', 
                        borderTop: '1px solid #dee2e6',
                        backgroundColor: 'white'
                    }}>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                            <textarea 
                                id="privateChatMessage"
                                placeholder="Type your private message..."
                                rows="2"
                                style={{ 
                                    flex: '1', 
                                    resize: 'none', 
                                    border: '1px solid #ced4da',
                                    borderRadius: '4px',
                                    padding: '5px',
                                    fontSize: '0.9em'
                                }}
                            />
                            <input 
                                id="privateChatFileInput"
                                type="file" 
                                onChange={(e) => setPrivateChatFile(e.target.files[0])}
                                style={{ 
                                    fontSize: '0.8em',
                                    width: '120px'
                                }}
                            />
                            <button 
                                onClick={handleSendPrivateMessage}
                                style={{ 
                                    backgroundColor: '#007bff', 
                                    color: 'white', 
                                    border: 'none', 
                                    padding: '8px 12px', 
                                    borderRadius: '4px', 
                                    cursor: 'pointer',
                                    fontSize: '0.9em'
                                }}
                            >
                                Send
                            </button>
                        </div>
                        {privateChatFile && (
                            <div style={{ marginTop: '5px', fontSize: '0.8em', color: '#6c757d' }}>
                                📎 Selected: {privateChatFile.name}
                            </div>
                        )}
                    </div>
                    
                    {/* Handles de redimensionamiento para chat privado */}
                    {/* Esquina inferior derecha */}
                    <div
                        onMouseDown={(e) => {
                            console.log('🎯 [DEBUG] Handle SE clicked!');
                            handleResizeStart(e, 'se');
                        }}
                        style={{
                            position: 'absolute',
                            bottom: '0',
                            right: '0',
                            width: '20px',
                            height: '20px',
                            cursor: 'nw-resize',
                            background: 'linear-gradient(-45deg, transparent 0%, transparent 40%, #007bff 40%, #007bff 60%, transparent 60%)',
                            borderBottomRightRadius: '8px',
                            opacity: '0.6',
                            transition: 'opacity 0.2s ease',
                            zIndex: 1001
                        }}
                        onMouseEnter={(e) => e.target.style.opacity = '1'}
                        onMouseLeave={(e) => e.target.style.opacity = '0.6'}
                        title="Resize from bottom-right corner"
                    />
                    
                    {/* Esquina inferior izquierda */}
                    <div
                        onMouseDown={(e) => handleResizeStart(e, 'sw')}
                        style={{
                            position: 'absolute',
                            bottom: '0',
                            left: '0',
                            width: '20px',
                            height: '20px',
                            cursor: 'ne-resize',
                            background: 'linear-gradient(45deg, transparent 0%, transparent 40%, #007bff 40%, #007bff 60%, transparent 60%)',
                            borderBottomLeftRadius: '8px',
                            opacity: '0.6',
                            transition: 'opacity 0.2s ease',
                            zIndex: 1001
                        }}
                        onMouseEnter={(e) => e.target.style.opacity = '1'}
                        onMouseLeave={(e) => e.target.style.opacity = '0.6'}
                        title="Resize from bottom-left corner"
                    />
                    
                    {/* Lado derecho */}
                    <div
                        onMouseDown={(e) => handleResizeStart(e, 'e')}
                        style={{
                            position: 'absolute',
                            top: '30px',
                            right: '0',
                            width: '5px',
                            height: `${windowSize.height - 60}px`,
                            cursor: 'e-resize',
                            backgroundColor: 'transparent',
                            zIndex: 1001
                        }}
                        onMouseEnter={(e) => e.target.style.backgroundColor = 'rgba(0, 123, 255, 0.3)'}
                        onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                        title="Resize width"
                    />
                    
                    {/* Lado izquierdo */}
                    <div
                        onMouseDown={(e) => handleResizeStart(e, 'w')}
                        style={{
                            position: 'absolute',
                            top: '30px',
                            left: '0',
                            width: '5px',
                            height: `${windowSize.height - 60}px`,
                            cursor: 'w-resize',
                            backgroundColor: 'transparent',
                            zIndex: 1001
                        }}
                        onMouseEnter={(e) => e.target.style.backgroundColor = 'rgba(0, 123, 255, 0.3)'}
                        onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                        title="Resize width"
                    />
                    
                    {/* Lado inferior */}
                    <div
                        onMouseDown={(e) => handleResizeStart(e, 's')}
                        style={{
                            position: 'absolute',
                            bottom: '0',
                            left: '20px',
                            width: `${windowSize.width - 40}px`,
                            height: '5px',
                            cursor: 's-resize',
                            backgroundColor: 'transparent',
                            zIndex: 1001
                        }}
                        onMouseEnter={(e) => e.target.style.backgroundColor = 'rgba(0, 123, 255, 0.3)'}
                        onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                        title="Resize height"
                    />
                    
                    {/* Lado superior */}
                    <div
                        onMouseDown={(e) => handleResizeStart(e, 'n')}
                        style={{
                            position: 'absolute',
                            top: '0',
                            left: '20px',
                            width: `${windowSize.width - 40}px`,
                            height: '5px',
                            cursor: 'n-resize',
                            backgroundColor: 'transparent',
                            zIndex: 1001
                        }}
                        onMouseEnter={(e) => e.target.style.backgroundColor = 'rgba(0, 123, 255, 0.3)'}
                        onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                        title="Resize height"
                    />
                </div>
            )}
            
            {/* Ventana del Chat General */}
            {showGeneralChatWindow && (
                <div 
                    style={{ 
                        position: 'fixed', 
                        left: `${generalChatPosition.x}px`,
                        top: `${generalChatPosition.y}px`,
                        width: `${generalChatSize.width}px`,
                        height: `${generalChatSize.height}px`, 
                        backgroundColor: '#fff', 
                        border: '2px solid #28a745', 
                        borderRadius: '10px',
                        zIndex: 999,
                        display: 'flex',
                        flexDirection: 'column',
                        boxShadow: (isGeneralChatDragging || isGeneralChatResizing) ? '0 10px 30px rgba(0,0,0,0.3)' : '0 5px 15px rgba(0,0,0,0.2)',
                        cursor: isGeneralChatDragging ? 'grabbing' : isGeneralChatResizing ? 'nw-resize' : 'default',
                        userSelect: 'none',
                        transition: (isGeneralChatDragging || isGeneralChatResizing) ? 'none' : 'box-shadow 0.2s ease',
                        minWidth: '400px',
                        minHeight: '300px',
                        maxWidth: '1000px',
                        maxHeight: '700px'
                    }}
                >
                    {/* Header del chat general - Área de drag */}
                    <div 
                        onMouseDown={handleGeneralChatMouseDown}
                        style={{ 
                            backgroundColor: '#28a745', 
                            color: 'white', 
                            padding: '10px 15px', 
                            borderRadius: '8px 8px 0 0',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            cursor: isGeneralChatDragging ? 'grabbing' : 'grab',
                            userSelect: 'none'
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '50%',
                                backgroundColor: 'rgba(255,255,255,0.2)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '1.2em'
                            }}>
                                💬
                            </div>
                            <div>
                                <h4 style={{ margin: '0', fontSize: '1em' }}>General Chat</h4>
                                <span style={{ fontSize: '0.75em', opacity: '0.8' }}>🔍 Drag to move • 📏 Resize handle</span>
                            </div>
                        </div>
                        <button 
                            onClick={() => setShowGeneralChatWindow(false)}
                            onMouseDown={(e) => e.stopPropagation()}
                            style={{ 
                                backgroundColor: 'transparent', 
                                border: 'none', 
                                color: 'white', 
                                fontSize: '1.2em', 
                                cursor: 'pointer',
                                padding: '0 5px',
                                borderRadius: '3px',
                                transition: 'background-color 0.2s ease'
                            }}
                            onMouseEnter={(e) => e.target.style.backgroundColor = 'rgba(255,255,255,0.2)'}
                            onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                            title="Close General Chat"
                        >
                            ✗
                        </button>
                    </div>
                    
                    {/* Mensajes del chat general */}
                    <div 
                        ref={generalChatMessagesRef}
                        style={{ 
                            flex: '1', 
                            overflowY: 'auto', 
                            padding: '10px', 
                            backgroundColor: '#f8f9fa',
                            minHeight: '200px',
                            overflow: 'auto' // Scroll cuando sea necesario
                        }}>
                        {dataMessages.length > 0 ? (
                            <ul style={{ listStyle: 'none', padding: '0', margin: '0' }}>
                                {dataMessages.map((msg) => (
                                    <li key={msg.id} style={{
                                        marginBottom: '12px',
                                        padding: '10px',
                                        backgroundColor: msg.userId === id ? '#e8f5e8' : '#fff',
                                        borderRadius: '8px',
                                        border: '1px solid #dee2e6',
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: '10px',
                                        maxWidth: '90%',
                                        marginLeft: msg.userId === id ? 'auto' : '0',
                                        marginRight: msg.userId === id ? '0' : 'auto'
                                    }}>
                                        {/* Avatar del usuario */}
                                        <div style={{
                                            width: '40px',
                                            height: '40px',
                                            borderRadius: '50%',
                                            overflow: 'hidden',
                                            border: '2px solid ' + (msg.userId === id ? '#28a745' : '#6c757d'),
                                            flexShrink: 0
                                        }}>
                                            {msg.avatarUrl ? (
                                                <img 
                                                    src={msg.avatarUrl} 
                                                    alt={msg.userName}
                                                    style={{
                                                        width: '100%',
                                                        height: '100%',
                                                        objectFit: 'cover'
                                                    }}
                                                    onError={(e) => {
                                                        console.log('Avatar error for', msg.userName, 'URL:', msg.avatarUrl);
                                                        e.target.style.display = 'none';
                                                        e.target.parentNode.querySelector('.avatar-fallback').style.display = 'flex';
                                                    }}
                                                />
                                            ) : null}
                                            <div 
                                                className="avatar-fallback"
                                                style={{
                                                    width: '100%',
                                                    height: '100%',
                                                    backgroundColor: msg.userId === id ? '#28a745' : '#6c757d',
                                                    color: 'white',
                                                    display: msg.avatarUrl ? 'none' : 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    fontSize: '16px',
                                                    fontWeight: 'bold'
                                                }}
                                            >
                                                {msg.userName?.charAt(0)?.toUpperCase() || '?'}
                                            </div>
                                        </div>
                                        
                                        {/* Contenido del mensaje */}
                                        <div style={{ flex: 1 }}>
                                            {/* Header con nombre y timestamp */}
                                            <div style={{ 
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                marginBottom: '4px',
                                                gap: '8px'
                                            }}>
                                                <strong style={{ 
                                                    color: msg.userId === id ? '#28a745' : '#495057',
                                                    fontSize: '0.95em'
                                                }}>
                                                    {msg.userName}{msg.userId === id ? ' (You)' : ''}
                                                </strong>
                                                <span style={{ 
                                                    fontSize: '0.75em', 
                                                    color: '#6c757d'
                                                }}>
                                                    {msg.timestamp ? new Date(msg.timestamp.seconds * 1000).toLocaleTimeString() : 'Now'}
                                                </span>
                                            </div>
                                            
                                            {/* Mensaje de texto */}
                                            {msg.message && (
                                                <div style={{ 
                                                    fontSize: '0.9em',
                                                    lineHeight: '1.4',
                                                    color: '#333',
                                                    marginBottom: msg.url ? '8px' : '0'
                                                }}>
                                                    {msg.message}
                                                </div>
                                            )}
                                            
                                            {/* Archivo adjunto */}
                                            {msg.url && (
                                                <div>
                                                    {!msg.message && (
                                                        <div style={{ 
                                                            fontSize: '0.9em', 
                                                            color: '#6c757d',
                                                            marginBottom: '6px',
                                                            fontStyle: 'italic'
                                                        }}>
                                                            shared a file
                                                        </div>
                                                    )}
                                                    <button 
                                                        onClick={() => downloadStorageFile(msg)} 
                                                        style={{
                                                            fontSize: '0.85em',
                                                            padding: '6px 12px',
                                                            backgroundColor: '#28a745',
                                                            color: 'white',
                                                            border: 'none',
                                                            borderRadius: '6px',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '6px',
                                                            transition: 'background-color 0.2s ease'
                                                        }}
                                                        onMouseEnter={(e) => e.target.style.backgroundColor = '#218838'}
                                                        onMouseLeave={(e) => e.target.style.backgroundColor = '#28a745'}
                                                    >
                                                        📁 {msg.fileName || 'Download file'}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <div style={{ 
                                textAlign: 'center', 
                                color: '#6c757d', 
                                fontStyle: 'italic', 
                                margin: '40px 20px',
                                fontSize: '1.1em'
                            }}>
                                <div style={{ fontSize: '3em', marginBottom: '10px' }}>💬</div>
                                No messages yet. Start the conversation!
                            </div>
                        )}
                    </div>
                    
                    {/* Handles de redimensionamiento para chat general */}
                    {/* Esquina inferior derecha */}
                    <div
                        onMouseDown={(e) => handleGeneralChatResizeStart(e, 'se')}
                        style={{
                            position: 'absolute',
                            bottom: '0',
                            right: '0',
                            width: '20px',
                            height: '20px',
                            cursor: 'nw-resize',
                            background: 'linear-gradient(-45deg, transparent 0%, transparent 40%, #28a745 40%, #28a745 60%, transparent 60%)',
                            borderBottomRightRadius: '8px',
                            opacity: '0.6',
                            transition: 'opacity 0.2s ease',
                            zIndex: 1001
                        }}
                        onMouseEnter={(e) => e.target.style.opacity = '1'}
                        onMouseLeave={(e) => e.target.style.opacity = '0.6'}
                        title="Resize from bottom-right corner"
                    />
                    
                    {/* Esquina inferior izquierda */}
                    <div
                        onMouseDown={(e) => handleGeneralChatResizeStart(e, 'sw')}
                        style={{
                            position: 'absolute',
                            bottom: '0',
                            left: '0',
                            width: '20px',
                            height: '20px',
                            cursor: 'ne-resize',
                            background: 'linear-gradient(45deg, transparent 0%, transparent 40%, #28a745 40%, #28a745 60%, transparent 60%)',
                            borderBottomLeftRadius: '8px',
                            opacity: '0.6',
                            transition: 'opacity 0.2s ease',
                            zIndex: 1001
                        }}
                        onMouseEnter={(e) => e.target.style.opacity = '1'}
                        onMouseLeave={(e) => e.target.style.opacity = '0.6'}
                        title="Resize from bottom-left corner"
                    />
                    
                    {/* Lado derecho */}
                    <div
                        onMouseDown={(e) => handleGeneralChatResizeStart(e, 'e')}
                        style={{
                            position: 'absolute',
                            top: '50px',
                            right: '0',
                            width: '5px',
                            height: `${generalChatSize.height - 100}px`,
                            cursor: 'e-resize',
                            backgroundColor: 'transparent',
                            zIndex: 1001
                        }}
                        onMouseEnter={(e) => e.target.style.backgroundColor = 'rgba(40, 167, 69, 0.3)'}
                        onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                        title="Resize width"
                    />
                    
                    {/* Lado izquierdo */}
                    <div
                        onMouseDown={(e) => handleGeneralChatResizeStart(e, 'w')}
                        style={{
                            position: 'absolute',
                            top: '50px',
                            left: '0',
                            width: '5px',
                            height: `${generalChatSize.height - 100}px`,
                            cursor: 'w-resize',
                            backgroundColor: 'transparent',
                            zIndex: 1001
                        }}
                        onMouseEnter={(e) => e.target.style.backgroundColor = 'rgba(40, 167, 69, 0.3)'}
                        onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                        title="Resize width"
                    />
                    
                    {/* Lado inferior */}
                    <div
                        onMouseDown={(e) => handleGeneralChatResizeStart(e, 's')}
                        style={{
                            position: 'absolute',
                            bottom: '0',
                            left: '20px',
                            width: `${generalChatSize.width - 40}px`,
                            height: '5px',
                            cursor: 's-resize',
                            backgroundColor: 'transparent',
                            zIndex: 1001
                        }}
                        onMouseEnter={(e) => e.target.style.backgroundColor = 'rgba(40, 167, 69, 0.3)'}
                        onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                        title="Resize height"
                    />
                    
                    {/* Lado superior */}
                    <div
                        onMouseDown={(e) => handleGeneralChatResizeStart(e, 'n')}
                        style={{
                            position: 'absolute',
                            top: '0',
                            left: '20px',
                            width: `${generalChatSize.width - 40}px`,
                            height: '5px',
                            cursor: 'n-resize',
                            backgroundColor: 'transparent',
                            zIndex: 1001
                        }}
                        onMouseEnter={(e) => e.target.style.backgroundColor = 'rgba(40, 167, 69, 0.3)'}
                        onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                        title="Resize height"
                    />
                </div>
            )}
            
            <ToastContainer />
        </div>
    );
}



export default ChatManager;



