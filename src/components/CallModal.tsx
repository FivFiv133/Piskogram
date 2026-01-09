'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Profile } from '@/types/database'
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff, X } from 'lucide-react'

interface CallModalProps {
  chatId: string
  currentUserId: string
  otherUser: Profile
  isVideoCall: boolean
  isIncoming?: boolean
  onClose: (callInfo?: { duration: number; wasConnected: boolean; isVideo: boolean }) => void
}

export default function CallModal({ chatId, currentUserId, otherUser, isVideoCall, isIncoming, onClose }: CallModalProps) {
  const [callStatus, setCallStatus] = useState<'calling' | 'connecting' | 'connected' | 'ended' | 'declined'>('calling')
  const [isMuted, setIsMuted] = useState(false)
  const [isVideoEnabled, setIsVideoEnabled] = useState(isVideoCall)
  const [remoteVideoEnabled, setRemoteVideoEnabled] = useState(false)
  const [callDuration, setCallDuration] = useState(0)
  
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const peerConnection = useRef<RTCPeerConnection | null>(null)
  const localStream = useRef<MediaStream | null>(null)
  const supabase = createClient()
  const callTimerRef = useRef<NodeJS.Timeout | null>(null)
  const callStartTime = useRef<number>(0)
  const wasConnected = useRef(false)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const hasEnded = useRef(false)
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([])

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const cleanup = useCallback(() => {
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current)
      callTimerRef.current = null
    }
    localStream.current?.getTracks().forEach(track => track.stop())
    localStream.current = null
    peerConnection.current?.close()
    peerConnection.current = null
  }, [])

  const handleClose = useCallback(() => {
    if (hasEnded.current) return
    hasEnded.current = true
    cleanup()
    onClose({
      duration: callDuration,
      wasConnected: wasConnected.current,
      isVideo: isVideoCall
    })
  }, [cleanup, onClose, callDuration, isVideoCall])

  const startCallTimer = useCallback(() => {
    callStartTime.current = Date.now()
    callTimerRef.current = setInterval(() => {
      setCallDuration(Math.floor((Date.now() - callStartTime.current) / 1000))
    }, 1000)
  }, [])

  const createPeerConnection = useCallback(() => {
    if (peerConnection.current) return peerConnection.current

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ]
    })

    pc.onicecandidate = (event) => {
      if (event.candidate && channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'call-signal',
          payload: { type: 'ice-candidate', candidate: event.candidate, from: currentUserId }
        })
      }
    }

    pc.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0]
        const videoTrack = event.streams[0].getVideoTracks()[0]
        if (videoTrack) {
          setRemoteVideoEnabled(videoTrack.enabled)
        }
      }
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        wasConnected.current = true
        setCallStatus('connected')
        startCallTimer()
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        if (!hasEnded.current) {
          setCallStatus('ended')
          setTimeout(handleClose, 1500)
        }
      }
    }

    peerConnection.current = pc
    return pc
  }, [currentUserId, startCallTimer, handleClose])

  const getMediaStream = useCallback(async (withVideo: boolean) => {
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: withVideo,
        audio: true
      })
    } catch {
      if (withVideo) {
        return await navigator.mediaDevices.getUserMedia({ video: false, audio: true })
      }
      throw new Error('Cannot access microphone')
    }
  }, [])

  const addPendingCandidates = useCallback(async () => {
    if (peerConnection.current && peerConnection.current.remoteDescription) {
      for (const candidate of pendingCandidates.current) {
        try {
          await peerConnection.current.addIceCandidate(candidate)
        } catch (err) {
          console.error('Failed to add pending ICE candidate:', err)
        }
      }
      pendingCandidates.current = []
    }
  }, [])

  // Outgoing call - create offer
  const startCall = useCallback(async () => {
    try {
      localStream.current = await getMediaStream(isVideoCall)
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStream.current
      }
      setIsVideoEnabled(localStream.current.getVideoTracks().length > 0 && localStream.current.getVideoTracks()[0]?.enabled)

      const pc = createPeerConnection()
      
      localStream.current.getTracks().forEach(track => {
        pc.addTrack(track, localStream.current!)
      })

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      channelRef.current?.send({
        type: 'broadcast',
        event: 'call-signal',
        payload: { type: 'offer', offer, from: currentUserId, isVideo: isVideoCall }
      })
    } catch (err) {
      console.error('Failed to start call:', err)
      setCallStatus('ended')
      setTimeout(handleClose, 1500)
    }
  }, [isVideoCall, currentUserId, createPeerConnection, getMediaStream, handleClose])

  // Incoming call - wait for offer then create answer
  const handleOffer = useCallback(async (offer: RTCSessionDescriptionInit) => {
    try {
      setCallStatus('connecting')
      
      localStream.current = await getMediaStream(isVideoCall)
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStream.current
      }
      setIsVideoEnabled(localStream.current.getVideoTracks().length > 0)

      const pc = createPeerConnection()

      localStream.current.getTracks().forEach(track => {
        pc.addTrack(track, localStream.current!)
      })

      await pc.setRemoteDescription(new RTCSessionDescription(offer))
      
      // Add any pending ICE candidates
      await addPendingCandidates()

      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)

      channelRef.current?.send({
        type: 'broadcast',
        event: 'call-signal',
        payload: { type: 'answer', answer, from: currentUserId }
      })
    } catch (err) {
      console.error('Failed to handle offer:', err)
      setCallStatus('ended')
      setTimeout(handleClose, 1500)
    }
  }, [isVideoCall, currentUserId, createPeerConnection, getMediaStream, handleClose, addPendingCandidates])

  const declineCall = useCallback(() => {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'call-signal',
      payload: { type: 'decline', from: currentUserId }
    })
    setCallStatus('declined')
    setTimeout(handleClose, 1000)
  }, [currentUserId, handleClose])

  const endCall = useCallback(() => {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'call-signal',
      payload: { type: 'end-call', from: currentUserId }
    })
    cleanup()
    setCallStatus('ended')
    setTimeout(handleClose, 1000)
  }, [currentUserId, cleanup, handleClose])

  const toggleMute = () => {
    if (localStream.current) {
      localStream.current.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled
      })
      setIsMuted(!isMuted)
    }
  }

  const toggleVideo = async () => {
    if (!localStream.current) return

    const videoTracks = localStream.current.getVideoTracks()
    
    if (videoTracks.length > 0) {
      videoTracks.forEach(track => {
        track.enabled = !track.enabled
      })
      setIsVideoEnabled(!isVideoEnabled)
    } else {
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({ video: true })
        const videoTrack = videoStream.getVideoTracks()[0]
        localStream.current.addTrack(videoTrack)
        
        const sender = peerConnection.current?.getSenders().find(s => s.track?.kind === 'video')
        if (sender) {
          sender.replaceTrack(videoTrack)
        } else {
          peerConnection.current?.addTrack(videoTrack, localStream.current)
        }
        
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStream.current
        }
        setIsVideoEnabled(true)
      } catch (err) {
        console.error('Failed to enable video:', err)
      }
    }
  }

  useEffect(() => {
    // Setup channel
    channelRef.current = supabase.channel(`call:${chatId}`)
    
    channelRef.current
      .on('broadcast', { event: 'call-signal' }, async ({ payload }) => {
        if (payload.from === currentUserId) return

        if (payload.type === 'offer' && isIncoming) {
          // Incoming call received offer
          await handleOffer(payload.offer)
        } else if (payload.type === 'answer' && peerConnection.current) {
          // Outgoing call received answer
          try {
            await peerConnection.current.setRemoteDescription(new RTCSessionDescription(payload.answer))
            await addPendingCandidates()
          } catch (err) {
            console.error('Failed to set remote description:', err)
          }
        } else if (payload.type === 'ice-candidate') {
          if (peerConnection.current?.remoteDescription) {
            try {
              await peerConnection.current.addIceCandidate(payload.candidate)
            } catch (err) {
              console.error('Failed to add ICE candidate:', err)
            }
          } else {
            // Queue candidate for later
            pendingCandidates.current.push(payload.candidate)
          }
        } else if (payload.type === 'end-call' || payload.type === 'decline') {
          cleanup()
          setCallStatus(payload.type === 'decline' ? 'declined' : 'ended')
          setTimeout(handleClose, 1000)
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          // Start call after channel is ready
          if (!isIncoming) {
            await startCall()
          } else {
            // Request offer from caller
            channelRef.current?.send({
              type: 'broadcast',
              event: 'call-signal',
              payload: { type: 'request-offer', from: currentUserId }
            })
          }
        }
      })

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
      }
      cleanup()
    }
  }, [])

  const showVideo = (isVideoEnabled || remoteVideoEnabled) && callStatus === 'connected'

  return (
    <div className="fixed inset-0 bg-dark-300 z-50 flex flex-col">
      {/* Video/Avatar area */}
      <div className="flex-1 relative bg-dark-200 overflow-hidden">
        {showVideo ? (
          <>
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
            {isVideoEnabled && (
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="absolute bottom-4 right-4 w-32 h-24 object-cover rounded-lg border-2 border-dark-50"
              />
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full">
            <video ref={remoteVideoRef} autoPlay playsInline className="hidden" />
            <video ref={localVideoRef} autoPlay playsInline muted className="hidden" />
            
            {otherUser.avatar_url ? (
              <img src={otherUser.avatar_url} alt="" className="w-32 h-32 rounded-full object-cover" />
            ) : (
              <div className="w-32 h-32 bg-gradient-to-br from-primary-600 to-primary-800 rounded-full flex items-center justify-center text-white text-5xl font-semibold">
                {otherUser.username[0].toUpperCase()}
              </div>
            )}
            <h2 className="mt-4 text-2xl font-semibold text-white">{otherUser.username}</h2>
            <p className="mt-2 text-gray-400">
              {callStatus === 'calling' && 'Вызов...'}
              {callStatus === 'connecting' && 'Соединение...'}
              {callStatus === 'connected' && formatDuration(callDuration)}
              {callStatus === 'ended' && 'Звонок завершён'}
              {callStatus === 'declined' && 'Звонок отклонён'}
            </p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="bg-dark-200 border-t border-dark-50 p-6">
        <div className="flex items-center justify-center gap-4">
          {callStatus === 'calling' || callStatus === 'connecting' || callStatus === 'connected' ? (
            <>
              <button
                onClick={toggleMute}
                className={`p-4 rounded-full transition-colors ${isMuted ? 'bg-red-600' : 'bg-dark-100 hover:bg-dark-50'}`}
                title={isMuted ? 'Включить микрофон' : 'Выключить микрофон'}
              >
                {isMuted ? <MicOff className="w-6 h-6 text-white" /> : <Mic className="w-6 h-6 text-white" />}
              </button>
              <button
                onClick={toggleVideo}
                className={`p-4 rounded-full transition-colors ${!isVideoEnabled ? 'bg-dark-100 hover:bg-dark-50' : 'bg-primary-600'}`}
                title={isVideoEnabled ? 'Выключить камеру' : 'Включить камеру'}
              >
                {isVideoEnabled ? <Video className="w-6 h-6 text-white" /> : <VideoOff className="w-6 h-6 text-white" />}
              </button>
              <button
                onClick={endCall}
                className="p-4 bg-red-600 hover:bg-red-700 rounded-full transition-colors"
                title="Завершить"
              >
                <PhoneOff className="w-6 h-6 text-white" />
              </button>
            </>
          ) : (
            <button
              onClick={handleClose}
              className="p-4 bg-dark-100 hover:bg-dark-50 rounded-full transition-colors"
            >
              <X className="w-6 h-6 text-white" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
