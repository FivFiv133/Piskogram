'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Profile } from '@/types/database'
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff, X } from 'lucide-react'

interface CallModalProps {
  chatId: string
  currentUserId: string
  otherUser: Profile
  isVideo: boolean
  isIncoming?: boolean
  onClose: () => void
}

export default function CallModal({ chatId, currentUserId, otherUser, isVideo, isIncoming, onClose }: CallModalProps) {
  const [callStatus, setCallStatus] = useState<'calling' | 'ringing' | 'connected' | 'ended'>('calling')
  const [isMuted, setIsMuted] = useState(false)
  const [isVideoEnabled, setIsVideoEnabled] = useState(isVideo)
  const [callDuration, setCallDuration] = useState(0)
  
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const peerConnection = useRef<RTCPeerConnection | null>(null)
  const localStream = useRef<MediaStream | null>(null)
  const supabase = createClient()
  const callTimerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (isIncoming) {
      setCallStatus('ringing')
    } else {
      startCall()
    }

    // Listen for call signals
    const channel = supabase
      .channel(`call:${chatId}`)
      .on('broadcast', { event: 'call-signal' }, async ({ payload }) => {
        if (payload.from === currentUserId) return

        if (payload.type === 'offer') {
          await handleOffer(payload.offer)
        } else if (payload.type === 'answer') {
          await handleAnswer(payload.answer)
        } else if (payload.type === 'ice-candidate') {
          await handleIceCandidate(payload.candidate)
        } else if (payload.type === 'end-call') {
          endCall()
        } else if (payload.type === 'accept-call') {
          setCallStatus('connected')
          startCallTimer()
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      cleanup()
    }
  }, [])

  const startCallTimer = () => {
    callTimerRef.current = setInterval(() => {
      setCallDuration(prev => prev + 1)
    }, 1000)
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const startCall = async () => {
    try {
      localStream.current = await navigator.mediaDevices.getUserMedia({
        video: isVideo,
        audio: true
      })

      if (localVideoRef.current && isVideo) {
        localVideoRef.current.srcObject = localStream.current
      }

      await createPeerConnection()
      const offer = await peerConnection.current!.createOffer()
      await peerConnection.current!.setLocalDescription(offer)

      await supabase.channel(`call:${chatId}`).send({
        type: 'broadcast',
        event: 'call-signal',
        payload: { type: 'offer', offer, from: currentUserId, isVideo }
      })
    } catch (err) {
      console.error('Failed to start call:', err)
      onClose()
    }
  }

  const createPeerConnection = async () => {
    peerConnection.current = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    })

    peerConnection.current.onicecandidate = (event) => {
      if (event.candidate) {
        supabase.channel(`call:${chatId}`).send({
          type: 'broadcast',
          event: 'call-signal',
          payload: { type: 'ice-candidate', candidate: event.candidate, from: currentUserId }
        })
      }
    }

    peerConnection.current.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0]
      }
    }

    if (localStream.current) {
      localStream.current.getTracks().forEach(track => {
        peerConnection.current!.addTrack(track, localStream.current!)
      })
    }
  }

  const handleOffer = async (offer: RTCSessionDescriptionInit) => {
    if (!peerConnection.current) {
      await createPeerConnection()
    }
    await peerConnection.current!.setRemoteDescription(offer)
  }

  const handleAnswer = async (answer: RTCSessionDescriptionInit) => {
    await peerConnection.current?.setRemoteDescription(answer)
  }

  const handleIceCandidate = async (candidate: RTCIceCandidateInit) => {
    await peerConnection.current?.addIceCandidate(candidate)
  }

  const acceptCall = async () => {
    try {
      localStream.current = await navigator.mediaDevices.getUserMedia({
        video: isVideo,
        audio: true
      })

      if (localVideoRef.current && isVideo) {
        localVideoRef.current.srcObject = localStream.current
      }

      if (!peerConnection.current) {
        await createPeerConnection()
      }

      localStream.current.getTracks().forEach(track => {
        peerConnection.current!.addTrack(track, localStream.current!)
      })

      const answer = await peerConnection.current!.createAnswer()
      await peerConnection.current!.setLocalDescription(answer)

      await supabase.channel(`call:${chatId}`).send({
        type: 'broadcast',
        event: 'call-signal',
        payload: { type: 'answer', answer, from: currentUserId }
      })

      await supabase.channel(`call:${chatId}`).send({
        type: 'broadcast',
        event: 'call-signal',
        payload: { type: 'accept-call', from: currentUserId }
      })

      setCallStatus('connected')
      startCallTimer()
    } catch (err) {
      console.error('Failed to accept call:', err)
    }
  }

  const endCall = () => {
    supabase.channel(`call:${chatId}`).send({
      type: 'broadcast',
      event: 'call-signal',
      payload: { type: 'end-call', from: currentUserId }
    })
    cleanup()
    setCallStatus('ended')
    setTimeout(onClose, 1000)
  }

  const cleanup = () => {
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current)
    }
    localStream.current?.getTracks().forEach(track => track.stop())
    peerConnection.current?.close()
  }

  const toggleMute = () => {
    if (localStream.current) {
      localStream.current.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled
      })
      setIsMuted(!isMuted)
    }
  }

  const toggleVideo = () => {
    if (localStream.current) {
      localStream.current.getVideoTracks().forEach(track => {
        track.enabled = !track.enabled
      })
      setIsVideoEnabled(!isVideoEnabled)
    }
  }

  return (
    <div className="fixed inset-0 bg-dark-300 z-50 flex flex-col">
      {/* Video area */}
      <div className="flex-1 relative bg-dark-200">
        {isVideo && callStatus === 'connected' ? (
          <>
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="absolute bottom-4 right-4 w-32 h-24 object-cover rounded-lg border-2 border-dark-50"
            />
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full">
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
            </p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="bg-dark-200 border-t border-dark-50 p-6">
        <div className="flex items-center justify-center gap-6">
          {callStatus === 'ringing' ? (
            <>
              <button
                onClick={endCall}
                className="p-4 bg-red-600 hover:bg-red-700 rounded-full transition-colors"
              >
                <PhoneOff className="w-6 h-6 text-white" />
              </button>
              <button
                onClick={acceptCall}
                className="p-4 bg-green-600 hover:bg-green-700 rounded-full transition-colors"
              >
                <Phone className="w-6 h-6 text-white" />
              </button>
            </>
          ) : callStatus !== 'ended' ? (
            <>
              <button
                onClick={toggleMute}
                className={`p-4 rounded-full transition-colors ${isMuted ? 'bg-red-600' : 'bg-dark-100 hover:bg-dark-50'}`}
              >
                {isMuted ? <MicOff className="w-6 h-6 text-white" /> : <Mic className="w-6 h-6 text-white" />}
              </button>
              {isVideo && (
                <button
                  onClick={toggleVideo}
                  className={`p-4 rounded-full transition-colors ${!isVideoEnabled ? 'bg-red-600' : 'bg-dark-100 hover:bg-dark-50'}`}
                >
                  {isVideoEnabled ? <Video className="w-6 h-6 text-white" /> : <VideoOff className="w-6 h-6 text-white" />}
                </button>
              )}
              <button
                onClick={endCall}
                className="p-4 bg-red-600 hover:bg-red-700 rounded-full transition-colors"
              >
                <PhoneOff className="w-6 h-6 text-white" />
              </button>
            </>
          ) : (
            <button
              onClick={onClose}
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
