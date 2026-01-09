'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Profile } from '@/types/database'
import { PhoneOff, Video, VideoOff, Mic, MicOff, X } from 'lucide-react'

interface CallModalProps {
  chatId: string
  currentUserId: string
  otherUser: Profile
  isVideoCall: boolean
  isIncoming: boolean
  onClose: (callInfo: { duration: number; wasConnected: boolean; isVideo: boolean }) => void
}

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

export default function CallModal({ chatId, currentUserId, otherUser, isVideoCall, isIncoming, onClose }: CallModalProps) {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'ended'>('connecting')
  const [isMuted, setIsMuted] = useState(false)
  const [isVideoOn, setIsVideoOn] = useState(isVideoCall)
  const [duration, setDuration] = useState(0)
  
  const localVideo = useRef<HTMLVideoElement>(null)
  const remoteVideo = useRef<HTMLVideoElement>(null)
  const pc = useRef<RTCPeerConnection | null>(null)
  const localStream = useRef<MediaStream | null>(null)
  const channel = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const connectedRef = useRef(false)
  const closedRef = useRef(false)
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([])
  
  const supabase = createClient()

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
  }

  const closeCall = (wasConnected = connectedRef.current) => {
    if (closedRef.current) return
    closedRef.current = true

    // Notify other party
    channel.current?.send({
      type: 'broadcast',
      event: 'webrtc',
      payload: { type: 'hangup', from: currentUserId }
    })

    // Cleanup
    if (timerRef.current) clearInterval(timerRef.current)
    localStream.current?.getTracks().forEach(t => t.stop())
    pc.current?.close()
    if (channel.current) supabase.removeChannel(channel.current)

    setStatus('ended')
    setTimeout(() => {
      onClose({ duration, wasConnected, isVideo: isVideoCall })
    }, 500)
  }

  useEffect(() => {
    let isMounted = true

    const init = async () => {
      try {
        // Get media
        localStream.current = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: isVideoCall
        })
        
        if (localVideo.current) {
          localVideo.current.srcObject = localStream.current
        }

        // Create peer connection
        pc.current = new RTCPeerConnection({ iceServers: ICE_SERVERS })

        // Add tracks
        localStream.current.getTracks().forEach(track => {
          pc.current!.addTrack(track, localStream.current!)
        })

        // Handle remote stream
        pc.current.ontrack = (e) => {
          if (remoteVideo.current && e.streams[0]) {
            remoteVideo.current.srcObject = e.streams[0]
          }
        }

        // Connection state
        pc.current.onconnectionstatechange = () => {
          const state = pc.current?.connectionState
          if (state === 'connected') {
            connectedRef.current = true
            setStatus('connected')
            timerRef.current = setInterval(() => {
              setDuration(d => d + 1)
            }, 1000)
          } else if (state === 'failed' || state === 'disconnected' || state === 'closed') {
            if (isMounted && !closedRef.current) {
              closeCall()
            }
          }
        }

        // Setup signaling channel
        channel.current = supabase.channel(`call-${chatId}`, {
          config: { broadcast: { self: false } }
        })

        // ICE candidates
        pc.current.onicecandidate = (e) => {
          if (e.candidate) {
            channel.current?.send({
              type: 'broadcast',
              event: 'webrtc',
              payload: { type: 'candidate', candidate: e.candidate, from: currentUserId }
            })
          }
        }

        // Handle incoming signals
        channel.current.on('broadcast', { event: 'webrtc' }, async ({ payload }) => {
          if (payload.from === currentUserId || !pc.current) return

          try {
            if (payload.type === 'offer') {
              await pc.current.setRemoteDescription(new RTCSessionDescription(payload.sdp))
              // Add any pending candidates
              for (const candidate of pendingCandidates.current) {
                await pc.current.addIceCandidate(new RTCIceCandidate(candidate))
              }
              pendingCandidates.current = []
              
              const answer = await pc.current.createAnswer()
              await pc.current.setLocalDescription(answer)
              channel.current?.send({
                type: 'broadcast',
                event: 'webrtc',
                payload: { type: 'answer', sdp: answer, from: currentUserId }
              })
            } else if (payload.type === 'answer') {
              await pc.current.setRemoteDescription(new RTCSessionDescription(payload.sdp))
              // Add any pending candidates
              for (const candidate of pendingCandidates.current) {
                await pc.current.addIceCandidate(new RTCIceCandidate(candidate))
              }
              pendingCandidates.current = []
            } else if (payload.type === 'candidate') {
              // Buffer candidates if remote description not set yet
              if (pc.current.remoteDescription) {
                await pc.current.addIceCandidate(new RTCIceCandidate(payload.candidate))
              } else {
                pendingCandidates.current.push(payload.candidate)
              }
            } else if (payload.type === 'hangup') {
              if (!closedRef.current) closeCall()
            }
          } catch (err) {
            console.error('Signal error:', err)
          }
        })

        await channel.current.subscribe()

        // If caller, create and send offer
        if (!isIncoming) {
          const offer = await pc.current.createOffer()
          await pc.current.setLocalDescription(offer)
          channel.current.send({
            type: 'broadcast',
            event: 'webrtc',
            payload: { type: 'offer', sdp: offer, from: currentUserId }
          })
        }

      } catch (err) {
        console.error('Call init error:', err)
        if (isMounted) closeCall(false)
      }
    }

    init()

    return () => {
      isMounted = false
      if (!closedRef.current) {
        if (timerRef.current) clearInterval(timerRef.current)
        localStream.current?.getTracks().forEach(t => t.stop())
        pc.current?.close()
        if (channel.current) supabase.removeChannel(channel.current)
      }
    }
  }, [])

  const toggleMute = () => {
    localStream.current?.getAudioTracks().forEach(t => {
      t.enabled = !t.enabled
    })
    setIsMuted(!isMuted)
  }

  const toggleVideo = async () => {
    const tracks = localStream.current?.getVideoTracks()
    if (tracks && tracks.length > 0) {
      tracks.forEach(t => { t.enabled = !t.enabled })
      setIsVideoOn(!isVideoOn)
    }
  }

  const showRemoteVideo = status === 'connected' && isVideoOn

  return (
    <div className="fixed inset-0 bg-dark-300 z-50 flex flex-col">
      <div className="flex-1 relative bg-dark-200 flex items-center justify-center">
        {showRemoteVideo ? (
          <>
            <video ref={remoteVideo} autoPlay playsInline className="w-full h-full object-cover" />
            <video ref={localVideo} autoPlay playsInline muted className="absolute bottom-4 right-4 w-32 h-24 rounded-lg border-2 border-dark-50 object-cover" />
          </>
        ) : (
          <div className="text-center">
            <video ref={remoteVideo} autoPlay playsInline className="hidden" />
            <video ref={localVideo} autoPlay playsInline muted className="hidden" />
            
            {otherUser.avatar_url ? (
              <img src={otherUser.avatar_url} alt="" className="w-32 h-32 rounded-full object-cover mx-auto" />
            ) : (
              <div className="w-32 h-32 bg-gradient-to-br from-primary-600 to-primary-800 rounded-full flex items-center justify-center text-white text-5xl font-semibold mx-auto">
                {otherUser.username[0].toUpperCase()}
              </div>
            )}
            <h2 className="mt-4 text-2xl font-semibold text-white">{otherUser.username}</h2>
            <p className="mt-2 text-gray-400">
              {status === 'connecting' && 'Соединение...'}
              {status === 'connected' && formatTime(duration)}
              {status === 'ended' && 'Завершён'}
            </p>
          </div>
        )}
      </div>

      <div className="bg-dark-200 border-t border-dark-50 p-6">
        <div className="flex justify-center gap-4">
          {status !== 'ended' ? (
            <>
              <button
                onClick={toggleMute}
                className={`p-4 rounded-full ${isMuted ? 'bg-red-600' : 'bg-dark-100 hover:bg-dark-50'}`}
              >
                {isMuted ? <MicOff className="w-6 h-6 text-white" /> : <Mic className="w-6 h-6 text-white" />}
              </button>
              {isVideoCall && (
                <button
                  onClick={toggleVideo}
                  className={`p-4 rounded-full ${!isVideoOn ? 'bg-dark-100' : 'bg-primary-600'}`}
                >
                  {isVideoOn ? <Video className="w-6 h-6 text-white" /> : <VideoOff className="w-6 h-6 text-white" />}
                </button>
              )}
              <button onClick={() => closeCall()} className="p-4 bg-red-600 hover:bg-red-700 rounded-full">
                <PhoneOff className="w-6 h-6 text-white" />
              </button>
            </>
          ) : (
            <button onClick={() => onClose({ duration, wasConnected: connectedRef.current, isVideo: isVideoCall })} className="p-4 bg-dark-100 rounded-full">
              <X className="w-6 h-6 text-white" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
