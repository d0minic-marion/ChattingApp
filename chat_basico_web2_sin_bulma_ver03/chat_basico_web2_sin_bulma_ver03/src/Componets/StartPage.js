

import { React, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { dbFirestore, storageFirebase, authFirebase } from '../connections/ConnFirestore';
import { ref, uploadBytes, getDownloadURL, uploadBytesResumable } from 'firebase/storage';
import { doc, setDoc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updatePassword, onAuthStateChanged } from 'firebase/auth';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import 'bulma/css/bulma.min.css';
import "./StartPage.css"

function StartPage() {
    const [userName, setUserName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [inscripVerified, setInscripVerified] = useState(false);
    const [currentUser, setCurrentUser] = useState(null);
    const [avatarFile, setAvatarFile] = useState(null);
    const [urlFileForImg, setUrlFileForImg] = useState('');
    const [newAvatarFile, setNewAvatarFile] = useState(null);
    const [isUpdatingAvatar, setIsUpdatingAvatar] = useState(false);
    const [avatarUploading, setAvatarUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [isLogin, setIsLogin] = useState(true); // true para login, false para registro
    const navigate = useNavigate();

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(authFirebase, async (user) => {
            if (user) {
                // Usuario autenticado, obtener datos adicionales de Firestore
                const userDocRef = doc(dbFirestore, 'chatBasico', 'Users', 'regUsers', user.uid);
                const userDocSnap = await getDoc(userDocRef);
                
                if (userDocSnap.exists()) {
                    const userData = userDocSnap.data();
                    setCurrentUser({
                        uid: user.uid,
                        email: user.email,
                        userName: userData.userName || '',
                        UrlAvatar: userData.UrlAvatar || ''
                    });
                    setUrlFileForImg(userData.UrlAvatar || '');
                    setInscripVerified(true);
                    
                    // Solo actualizar estado si realmente cambió
                    if (userData.status !== 'active') {
                        await updateDoc(userDocRef, {
                            status: 'active',
                            lastSeen: serverTimestamp()
                        });
                        console.log('👤 [USER STATUS] User status updated to active');
                    }
                } else {
                    // Si no existe el documento en Firestore, crearlo
                    const defaultUserName = user.email.split('@')[0];
                    await setDoc(userDocRef, {
                        userName: defaultUserName,
                        email: user.email,
                        UrlAvatar: '',
                        status: 'active',
                        lastSeen: serverTimestamp()
                    });
                    setCurrentUser({
                        uid: user.uid,
                        email: user.email,
                        userName: defaultUserName,
                        UrlAvatar: ''
                    });
                    setInscripVerified(true);
                }
            } else {
                // Usuario no autenticado - solo limpiar estado local
                setCurrentUser(null);
                setInscripVerified(false);
                setUrlFileForImg('');
            }
        });

        return () => unsubscribe();
    }, []); // Sin dependencias

    async function handleSubmit(event) {
        event.preventDefault();
        
        if (email === '' || password === '') {
            toast.error('Email and Password are required', { position: 'top-left', autoClose: 2000 });
            return;
        }

        try {
            if (isLogin) {
                // Proceso de login
                await signInWithEmailAndPassword(authFirebase, email, password);
                toast.success(`Welcome back!`, { position: 'top-left', autoClose: 1500 });
            } else {
                // Proceso de registro
                if (userName === '') {
                    toast.error('User name is required for registration', { position: 'top-left', autoClose: 2000 });
                    return;
                }

                const userCredential = await createUserWithEmailAndPassword(authFirebase, email, password);
                const user = userCredential.user;

                // Subir avatar si se seleccionó
                let avatarURL = '';
                if (avatarFile) {
                    const storageRef = ref(storageFirebase, `avatars/${user.uid}_${avatarFile.name}`);
                    const snapshot = await uploadBytes(storageRef, avatarFile);
                    avatarURL = await getDownloadURL(snapshot.ref);
                }

                // Guardar datos adicionales en Firestore
                const userDocRef = doc(dbFirestore, 'chatBasico', 'Users', 'regUsers', user.uid);
                await setDoc(userDocRef, {
                    userName: userName,
                    email: email,
                    UrlAvatar: avatarURL,
                    status: 'active',
                    lastSeen: serverTimestamp()
                });

                toast.success('User registered successfully', { position: 'top-left', autoClose: 1500 });
            }
            
            // Limpiar formulario
            setUserName('');
            setEmail('');
            setPassword('');
            setAvatarFile(null);
            
        } catch (error) {
            console.error('Authentication error:', error);
            if (error.code === 'auth/email-already-in-use') {
                toast.error('Email already in use', { position: 'top-left', autoClose: 2000 });
            } else if (error.code === 'auth/weak-password') {
                toast.error('Password should be at least 6 characters', { position: 'top-left', autoClose: 2000 });
            } else if (error.code === 'auth/user-not-found') {
                toast.error('User not found', { position: 'top-left', autoClose: 2000 });
            } else if (error.code === 'auth/wrong-password') {
                toast.error('Wrong password', { position: 'top-left', autoClose: 2000 });
            } else {
                toast.error('Authentication failed', { position: 'top-left', autoClose: 2000 });
            }
        }
    }

    async function handleChangePassword() {
        const newPassword = document.getElementById('newPasswordInput').value;
        if (!newPassword) {
            toast.error('New password cannot be empty', { position: 'top-left', autoClose: 2000 });
            return;
        }

        try {
            await updatePassword(authFirebase.currentUser, newPassword);
            toast.success('Password changed successfully', { position: 'top-left', autoClose: 1500 });
            document.getElementById('newPasswordInput').value = '';
        } catch (error) {
            console.error('Error changing password:', error);
            toast.error('Error changing password', { position: 'top-left', autoClose: 2000 });
        }
    }

    // Avatar management functions
    const handleAvatarChange = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        // Validar tipo de archivo
        if (!file.type.startsWith('image/')) {
            toast.error('Please select an image file', { position: 'top-left', autoClose: 2000 });
            return;
        }

        // Validar tamaño (5MB max)
        if (file.size > 5 * 1024 * 1024) {
            toast.error('Image size must be less than 5MB', { position: 'top-left', autoClose: 2000 });
            return;
        }

        setAvatarUploading(true);
        
        try {
            console.log('🎭 [AVATAR] Starting avatar upload process...');
            
            // Crear referencia única para el archivo
            const fileName = `avatars/${currentUser.uid}_${Date.now()}_${file.name}`;
            const storageRef = ref(storageFirebase, fileName);
            
            // Subir archivo
            console.log('📤 [AVATAR] Uploading file to Firebase Storage...');
            const uploadTask = uploadBytesResumable(storageRef, file);
            
            uploadTask.on('state_changed', 
                (snapshot) => {
                    const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                    setUploadProgress(progress);
                    console.log(`🔄 [AVATAR] Upload progress: ${progress.toFixed(1)}%`);
                },
                (error) => {
                    console.error('💥 [AVATAR] Upload failed:', error);
                    toast.error('Upload failed', { position: 'top-left', autoClose: 2000 });
                    setAvatarUploading(false);
                    setUploadProgress(0);
                },
                async () => {
                    try {
                        // Obtener URL de descarga
                        const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                        console.log('✅ [AVATAR] File uploaded successfully, URL:', downloadURL);
                        
                        // Actualizar documento del usuario
                        const userDocRef = doc(dbFirestore, 'chatBasico', 'Users', 'regUsers', currentUser.uid);
                        await updateDoc(userDocRef, {
                            UrlAvatar: downloadURL
                        });
                        
                        console.log('🔄 [AVATAR] User document updated with new avatar');
                        
                        // Actualizar estado local
                        setCurrentUser(prevUser => ({
                            ...prevUser,
                            UrlAvatar: downloadURL
                        }));
                        
                        // Actualizar visualización del avatar
                        setUrlFileForImg(downloadURL);
                        
                        console.log('📱 [AVATAR] Local state updated');
                        
                        toast.success('Avatar updated successfully! Changes will appear immediately in chat.', { 
                            position: 'top-left', 
                            autoClose: 3000 
                        });
                        
                    } catch (error) {
                        console.error('💥 [AVATAR] Error updating avatar:', error);
                        toast.error('Error updating avatar', { position: 'top-left', autoClose: 2000 });
                    } finally {
                        setAvatarUploading(false);
                        setUploadProgress(0);
                    }
                }
            );
            
        } catch (error) {
            console.error('💥 [AVATAR] Unexpected error:', error);
            toast.error('Unexpected error occurred', { position: 'top-left', autoClose: 2000 });
            setAvatarUploading(false);
            setUploadProgress(0);
        }
    };

    function goToChat() {
        if (currentUser) {
            console.log('🚀 [NAVIGATION] Navigating to chat with user data:', {
                uid: currentUser.uid,
                userName: currentUser.userName,
                UrlAvatar: currentUser.UrlAvatar || 'No avatar',
                hasAvatar: !!currentUser.UrlAvatar
            });
            navigate('/chat', { 
                state: { 
                    id: currentUser.uid, 
                    userName: currentUser.userName
                } 
            });
        }
    }

    var Registered = () => {
        return (
            <div style={{
                maxWidth: '600px',
                margin: '0 auto',
                padding: '30px',
                fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
                backgroundColor: '#f8f9fa',
                minHeight: '100vh'
            }}>
                {/* Header Section */}
                <div style={{
                    textAlign: 'center',
                    marginBottom: '40px',
                    padding: '30px',
                    backgroundColor: '#ffffff',
                    borderRadius: '15px',
                    boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
                    border: '1px solid #e9ecef'
                }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: '20px'
                    }}>
                        {urlFileForImg && (
                            <img 
                                src={urlFileForImg} 
                                alt="User Avatar" 
                                style={{ 
                                    width: '80px', 
                                    height: '80px', 
                                    borderRadius: '50%', 
                                    marginRight: '20px',
                                    border: '4px solid #007bff',
                                    boxShadow: '0 4px 10px rgba(0,123,255,0.3)'
                                }} 
                            />
                        )}
                        <div>
                            <h1 style={{
                                margin: '0',
                                color: '#2c3e50',
                                fontSize: '2.2em',
                                fontWeight: '600'
                            }}>
                                ¡Bienvenido, {currentUser?.userName}! 👋
                            </h1>
                            <p style={{
                                margin: '10px 0 0 0',
                                color: '#6c757d',
                                fontSize: '1.1em'
                            }}>
                                Gestiona tu perfil y accede al chat
                            </p>
                        </div>
                    </div>
                </div>
                
                {/* Avatar Management Section */}
                <div style={{ 
                    marginBottom: '30px', 
                    padding: '25px', 
                    backgroundColor: '#ffffff',
                    borderRadius: '15px',
                    boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
                    border: '1px solid #e9ecef'
                }}>
                    <h3 style={{
                        margin: '0 0 20px 0',
                        color: '#495057',
                        fontSize: '1.4em',
                        fontWeight: '600',
                        display: 'flex',
                        alignItems: 'center'
                    }}>
                        🎭 Gestionar Avatar
                    </h3>
                    
                    {/* Mostrar avatar actual */}
                    {currentUser?.UrlAvatar && (
                        <div style={{ 
                            marginBottom: '20px',
                            textAlign: 'center',
                            padding: '15px',
                            backgroundColor: '#f8f9fa',
                            borderRadius: '10px',
                            border: '1px solid #dee2e6'
                        }}>
                            <label style={{
                                display: 'block',
                                marginBottom: '10px',
                                color: '#495057',
                                fontWeight: '500'
                            }}>
                                Avatar actual:
                            </label>
                            <img 
                                src={currentUser.UrlAvatar} 
                                alt="Avatar actual" 
                                style={{ 
                                    width: '80px', 
                                    height: '80px', 
                                    borderRadius: '50%',
                                    border: '3px solid #007bff',
                                    boxShadow: '0 4px 10px rgba(0,123,255,0.3)'
                                }} 
                            />
                        </div>
                    )}
                    
                    <div style={{ marginBottom: '15px' }}>
                        <label htmlFor="avatarInput" style={{ 
                            display: 'block', 
                            marginBottom: '8px',
                            color: '#495057',
                            fontWeight: '500'
                        }}>
                            Seleccionar nuevo avatar:
                        </label>
                        <input 
                            type="file" 
                            id="avatarInput"
                            accept="image/*" 
                            onChange={handleAvatarChange}
                            disabled={avatarUploading}
                            style={{ 
                                marginBottom: '15px',
                                padding: '10px',
                                border: '2px solid #dee2e6',
                                borderRadius: '8px',
                                width: '100%',
                                fontSize: '14px',
                                backgroundColor: avatarUploading ? '#f8f9fa' : '#ffffff',
                                cursor: avatarUploading ? 'not-allowed' : 'pointer'
                            }}
                        />
                    </div>
                    
                    {avatarUploading && (
                        <div style={{ 
                            marginBottom: '15px',
                            padding: '15px',
                            backgroundColor: '#f8f9fa',
                            borderRadius: '8px',
                            border: '1px solid #dee2e6'
                        }}>
                            <p style={{ 
                                margin: '0 0 10px 0', 
                                fontSize: '14px',
                                color: '#495057',
                                fontWeight: '500'
                            }}>
                                📤 Subiendo archivo: {uploadProgress.toFixed(1)}%
                            </p>
                            <div style={{ 
                                width: '100%', 
                                backgroundColor: '#e9ecef', 
                                borderRadius: '10px',
                                overflow: 'hidden',
                                height: '8px'
                            }}>
                                <div 
                                    style={{ 
                                        width: `${uploadProgress}%`, 
                                        height: '100%', 
                                        background: 'linear-gradient(90deg, #28a745, #20c997)',
                                        transition: 'width 0.3s ease',
                                        borderRadius: '10px'
                                    }}
                                ></div>
                            </div>
                        </div>
                    )}
                    
                    <div style={{
                        backgroundColor: '#e3f2fd',
                        padding: '12px',
                        borderRadius: '8px',
                        border: '1px solid #bbdefb'
                    }}>
                        <p style={{ 
                            fontSize: '13px', 
                            color: '#1565c0', 
                            margin: '0',
                            lineHeight: '1.4'
                        }}>
                            <strong>ℹ️ Información importante:</strong><br/>
                            • Formatos soportados: JPG, PNG, GIF<br/>
                            • Tamaño máximo: 5MB<br/>
                            • Los cambios se aplicarán a todos tus mensajes anteriores
                        </p>
                    </div>
                </div>
                
                {/* Password Change Section */}
                <div style={{ 
                    marginBottom: '30px', 
                    padding: '25px', 
                    backgroundColor: '#ffffff',
                    borderRadius: '15px',
                    boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
                    border: '1px solid #e9ecef'
                }}>
                    <h3 style={{
                        margin: '0 0 20px 0',
                        color: '#495057',
                        fontSize: '1.4em',
                        fontWeight: '600',
                        display: 'flex',
                        alignItems: 'center'
                    }}>
                        🔐 Cambiar Contraseña
                    </h3>
                    
                    <div style={{ marginBottom: '15px' }}>
                        <label style={{ 
                            display: 'block', 
                            marginBottom: '8px',
                            color: '#495057',
                            fontWeight: '500'
                        }}>
                            Nueva contraseña:
                        </label>
                        <input 
                            type="password" 
                            placeholder="Ingresa tu nueva contraseña" 
                            id="newPasswordInput"
                            style={{
                                width: '100%',
                                padding: '12px',
                                border: '2px solid #dee2e6',
                                borderRadius: '8px',
                                fontSize: '14px',
                                backgroundColor: '#ffffff',
                                marginBottom: '15px'
                            }}
                        />
                    </div>
                    
                    <button 
                        onClick={handleChangePassword}
                        style={{
                            backgroundColor: '#dc3545',
                            color: '#ffffff',
                            border: 'none',
                            padding: '12px 25px',
                            borderRadius: '8px',
                            fontSize: '14px',
                            fontWeight: '600',
                            cursor: 'pointer',
                            transition: 'all 0.3s ease',
                            boxShadow: '0 2px 8px rgba(220,53,69,0.3)'
                        }}
                        onMouseOver={(e) => e.target.style.backgroundColor = '#c82333'}
                        onMouseOut={(e) => e.target.style.backgroundColor = '#dc3545'}
                    >
                        🔄 Actualizar Contraseña
                    </button>
                </div>
                
                {/* Action Button */}
                <div style={{ textAlign: 'center' }}>
                    <button 
                        onClick={goToChat}
                        style={{
                            backgroundColor: '#007bff',
                            color: '#ffffff',
                            border: 'none',
                            padding: '15px 40px',
                            borderRadius: '12px',
                            fontSize: '16px',
                            fontWeight: '600',
                            cursor: 'pointer',
                            transition: 'all 0.3s ease',
                            boxShadow: '0 4px 15px rgba(0,123,255,0.3)',
                            textTransform: 'none'
                        }}
                        onMouseOver={(e) => {
                            e.target.style.backgroundColor = '#0056b3';
                            e.target.style.transform = 'translateY(-2px)';
                            e.target.style.boxShadow = '0 6px 20px rgba(0,123,255,0.4)';
                        }}
                        onMouseOut={(e) => {
                            e.target.style.backgroundColor = '#007bff';
                            e.target.style.transform = 'translateY(0)';
                            e.target.style.boxShadow = '0 4px 15px rgba(0,123,255,0.3)';
                        }}
                    >
                        💬 Ir al Chat
                    </button>
                </div>
            </div>
        );
    }

    var InscriptionForm = () => {
        return (
            <div>
                <h1 className='is-3'>Chat User {isLogin ? 'Sign In' : 'Sign Up'}</h1>
                <form onSubmit={handleSubmit} className='box'>
                    {!isLogin && (
                        <>
                            <label>User name:</label><br />
                            <input
                                className='input inputPAGE'
                                placeholder='Enter an username'
                                type="text" 
                                value={userName} 
                                onChange={(e) => setUserName(e.target.value)} 
                            /><br />
                        </>
                    )}
                    <label>Email:</label><br />
                    <input
                        placeholder='Email'
                        className='input inputPAGE'
                        type="email" 
                        value={email} 
                        onChange={(e) => setEmail(e.target.value)} 
                    /><br />
                    <label>Password:</label><br />
                    <input 
                        placeholder='Password'
                        className='input inputPAGE'
                        type="password" 
                        value={password} 
                        onChange={(e) => setPassword(e.target.value)} 
                    /><br />
                    {!isLogin && (
                        <>
                        <label>Avatar:</label>
                        <div class="file">
                            <label class="file-label">
                                <input class="file-input" type="file" name='resume' onChange={(e) => setAvatarFile(e.target.files[0])}/>
                                <span class="file-cta">
                                <span class="file-icon">
                                    <i class="fas fa-upload"></i>
                                </span>
                                <span class="file-label"> Choose a file… </span>
                                </span>
                            </label>
                        </div>
                        </>
                    )}
                    <button className="button  is-link" type="submit">{isLogin ? 'Sign In' : 'Sign Up'}</button>
                </form>
                <p>
                    {isLogin ? "Don't have an account? " : "Already have an account? "}
                    <button 
                        type="button" 
                        onClick={() => setIsLogin(!isLogin)}
                        style={{ background: 'none', border: 'none', color: 'blue', textDecoration: 'underline', cursor: 'pointer' }}
                    >
                        {isLogin ? 'Sign Up' : 'Sign In'}
                    </button>
                </p>
            </div>
        )
    }

    return (

        <div style={{ height: '20px' }}>
            {inscripVerified ? Registered() :
                InscriptionForm()
            }
            <ToastContainer position='top-left' />
        </div>



    )
}


export default StartPage;