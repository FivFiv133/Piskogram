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
  incomingOffer?: RTCSessionDescriptionInit
  onClose: (callInfo?: { duration: number; wasConnected: boolean; isVideo: boolean }) => void
}

export default function CallModal({ chatId, currentUserId, otherUser, isVideoCall, isIncoming, incomingOffer, onClose }: CallModalProps) {
  const [callStatus, setCallStatus] = useState<'calling' | 'ringing' | 'connected' | 'ended' | 'declined'>('calling')
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

  const createPeerConnection = useCallback(async () => {
    peerConnection.current = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ]
    })

    peerConnection.current.onicecandidate = (event) => {
      if (event.candidate && channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'call-signal',
          payload: { type: 'ice-candidate', candidate: event.candidate, from: currentUserId }
        })
      }
    }

    peerConnection.current.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0]
        const videoTrack = event.streams[0].getVideoTracks()[0]
        if (videoTrack) {
          setRemoteVideoEnabled(videoTrack.enabled)
        }
      }
    }

    peerConnection.current.onconnectionstatechange = () => {
      if (peerConnection.current?.connectionState === 'connected') {
        wasConnected.current = true
        setCallStatus('connected')
        startCallTimer()
      }
    }
  }, [currentUserId, startCallTimer])

  const getMediaStream = useCallback(async (withVideo: boolean) => {
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: withVideo,
        audio: true
      })
    } catch {
      // If video fails, try audio only
      if (withVideo) {
        return await navigator.mediaDevices.getUserMedia({ video: false, audio: true })
      }
      throw new Error('Cannot access microphone')
    }
  }, [])

  const startCall = useCallback(async () => {
    try {
      localStream.current = await getMediaStream(isVideoCall)
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStream.current
      }
      setIsVideoEnabled(localStream.current.getVideoTracks().length > 0 && localStream.current.getVideoTracks()[0].enabled)

      await createPeerConnection()
      
      localStream.current.getTracks().forEach(track => {
        peerConnection.current!.addTrack(track, localStream.current!)
      })

      const offer = await peerConnection.current!.createOffer()
      await peerConnection.current!.setLocalDescription(offer)

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

  const acceptCall = useCallback(async () => {
    try {
      localStream.current = await getMediaStream(isVideoCall)
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStream.current
      }
      setIsVideoEnabled(localStream.current.getVideoTracks().length > 0)

      await createPeerConnection()

      localStream.current.getTracks().forEach(track => {
        peerConnection.current!.addTrack(track, localStream.current!)
      })

      if (incomingOffer) {
        await peerConnection.current!.setRemoteDescription(incomingOffer)
      }

      const answer = await peerConnection.current!.createAnswer()
      await peerConnection.current!.setLocalDescription(answer)

      channelRef.current?.send({
        type: 'broadcast',
        event: 'call-signal',
        payload: { type: 'answer', answer, from: currentUserId }
      })
    } catch (err) {
      console.error('Failed to accept call:', err)
      setCallStatus('ended')
      setTimeout(handleClose, 1500)
    }
  }, [isVideoCall, currentUserId, incomingOffer, createPeerConnection, getMediaStream, handleClose])

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
      // Add video track if not present
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

        if (payload.type === 'answer' && peerConnection.current) {
          await peerConnection.current.setRemoteDescription(payload.answer)
        } else if (payload.type === 'ice-candidate' && peerConnection.current) {
          try {
            await peerConnection.current.addIceCandidate(payload.candidate)
          } catch (err) {
            console.error('Failed to add ICE candidate:', err)
          }
        } else if (payload.type === 'end-call' || payload.type === 'decline') {
          cleanup()
          setCallStatus(payload.type === 'decline' ? 'declined' : 'ended')
          setTimeout(handleClose, 1000)
        }
      })
      .subscribe()

    // Start or wait for call
    if (isIncoming) {
      setCallStatus('ringing')
    } else {
      startCall()
    }

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
            {/* Hidden video elements for audio */}
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
              {callStatus === 'ringing' && 'Входящий звонок...'}
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
          {callStatus === 'ringing' ? (
            <>
              <button
                onClick={declineCall}
                className="p-4 bg-red-600 hover:bg-red-700 rounded-full transition-colors"
                title="Отклонить"
              >
                <PhoneOff className="w-6 h-6 text-white" />
              </button>
              <button
                onClick={acceptCall}
                className="p-4 bg-green-600 hover:bg-green-700 rounded-full transition-colors"
                title="Принять"
              >
                <Phone className="w-6 h-6 text-white" />
              </button>
            </>
          ) : callStatus === 'calling' || callStatus === 'connected' ? (
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
