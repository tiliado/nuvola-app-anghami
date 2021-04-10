/*
 * Copyright 2021 Jiří Janoušek <janousek.jiri@gmail.com>
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
 * ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

'use strict';

(function (Nuvola) {
  // Create media player component
  const player = Nuvola.$object(Nuvola.MediaPlayer)

  // Handy aliases
  const PlaybackState = Nuvola.PlaybackState
  const PlayerAction = Nuvola.PlayerAction
  const C_ = Nuvola.Translate.pgettext

  const ACTION_LIKE = 'like'

  // Create new WebApp prototype
  const WebApp = Nuvola.$WebApp()

  WebApp._onInitAppRunner = function (emitter) {
    Nuvola.WebApp._onInitAppRunner.call(this, emitter)
    Nuvola.actions.addAction('playback', 'win', ACTION_LIKE, C_('Action', 'Like song'),
      null, null, null, false)
  }

  // Initialization routines
  WebApp._onInitWebWorker = function (emitter) {
    Nuvola.WebApp._onInitWebWorker.call(this, emitter)

    const state = document.readyState
    if (state === 'interactive' || state === 'complete') {
      this._onPageReady()
    } else {
      document.addEventListener('DOMContentLoaded', this._onPageReady.bind(this))
    }
  }

  // Page is ready for magic
  WebApp._onPageReady = function () {
    this.timeTotal = null
    Nuvola.actions.connect('ActionActivated', this)
    player.addExtraActions([ACTION_LIKE])
    this.update()
  }

  // Extract data from the web page
  WebApp.update = function () {
    const elms = this._getElements()
    const times = this._getTimes()

    const track = {
      title: Nuvola.queryText('.player-wrapper .action-title'),
      artist: Nuvola.queryText('.player-wrapper .action-artist'),
      album: null,
      artLocation: null,
      length: times[1]
    }

    const artwork = document.querySelector('.player-wrapper .track-coverart')
    if (artwork && artwork.style.backgroundImage) {
      track.artLocation = artwork.style.backgroundImage.split('"')[1].replace('/webp/', '').replace('size=60', 'size=256')
    }

    let state
    if (elms.pause) {
      state = PlaybackState.PLAYING
    } else if (elms.play) {
      state = PlaybackState.PAUSED
    } else {
      state = PlaybackState.UNKNOWN
    }

    player.setPlaybackState(state)
    player.setTrack(track)
    player.setCanGoPrev(elms.prev)
    player.setCanGoNext(elms.next)
    player.setCanPlay(elms.play)
    player.setCanPause(elms.pause)

    player.setTrackPosition(times[0])
    player.setCanSeek(state !== PlaybackState.UNKNOWN && elms.progressbar)

    let volume = null
    if (elms.volumebar && elms.volumebar.firstChild) {
      volume = elms.volumebar.firstChild.style.height.replace('%', '') / 100
    }
    player.updateVolume(volume)
    player.setCanChangeVolume(state !== PlaybackState.UNKNOWN)

    const repeat = this._getRepeat(elms)
    player.setCanRepeat(repeat !== null)
    player.setRepeatState(repeat)

    const shuffle = elms.shuffle ? elms.shuffle.classList.contains('active') : null
    player.setCanShuffle(shuffle !== null)
    player.setShuffleState(shuffle)

    Nuvola.actions.updateEnabledFlag(ACTION_LIKE, !!elms.like)
    Nuvola.actions.updateState(ACTION_LIKE, elms.like && elms.like.getAttribute('aria-checked') === 'true')

    setTimeout(this.update.bind(this), 500)
  }

  WebApp._onActionActivated = function (emitter, name, param) {
    const elms = this._getElements()
    switch (name) {
      case PlayerAction.TOGGLE_PLAY:
        if (elms.play) {
          Nuvola.clickOnElement(elms.play)
        } else {
          Nuvola.clickOnElement(elms.pause)
        }
        break
      case PlayerAction.PLAY:
        Nuvola.clickOnElement(elms.play)
        break
      case PlayerAction.PAUSE:
      case PlayerAction.STOP:
        Nuvola.clickOnElement(elms.pause)
        break
      case PlayerAction.PREV_SONG:
        Nuvola.clickOnElement(elms.prev)
        break
      case PlayerAction.NEXT_SONG:
        Nuvola.clickOnElement(elms.next)
        break
      case PlayerAction.SHUFFLE:
        Nuvola.clickOnElement(elms.shuffle)
        break
      case PlayerAction.REPEAT:
        this._setRepeat(elms, param)
        break
      case PlayerAction.SEEK: {
        const total = this._getTimes()[1]
        if (total && param > 0 && param <= total) {
          Nuvola.clickOnElement(elms.progressbar, param / total, 0.5)
        }
        break
      }
      case PlayerAction.CHANGE_VOLUME:
        elms.volumebar.parentNode.style.display = 'block'
        Nuvola.clickOnElement(elms.volumebar, 0.5, Math.max(0, 1 - param))
        elms.volumebar.parentNode.style.display = ''
        break
      case ACTION_LIKE:
        Nuvola.clickOnElement(elms.like)
        break
    }
  }

  WebApp._getRepeat = function (elms) {
    if (!elms.repeat) {
      return null
    }
    return elms.repeat.classList.contains('active') ? Nuvola.PlayerRepeat.PLAYLIST : Nuvola.PlayerRepeat.NONE
  }

  WebApp._setRepeat = function (elms, value) {
    const repeat = this._getRepeat(elms)
    if (value !== Nuvola.PlayerRepeat.TRACK && value !== repeat) {
      Nuvola.clickOnElement(elms.repeat)
    }
  }

  WebApp._getTimes = function () {
    let elapsed = Nuvola.queryText('.player-wrapper .duration-text')
    const remaining = Nuvola.queryText('.player-wrapper .duration-text:last-child')
    if (!elapsed || !remaining) {
      return [null, null]
    }

    elapsed = Nuvola.parseTimeUsec(elapsed)
    const total = elapsed + Nuvola.parseTimeUsec(remaining)

    if (!this.timeTotal || Math.abs(this.timeTotal - total) >= 2000000) {
      this.timeTotal = total
    }

    return [elapsed, this.timeTotal]
  }

  WebApp._getElements = function () {
    // Interesting elements
    const elms = {
      play: document.querySelector('.player-wrapper .icon.play'),
      pause: document.querySelector('.player-wrapper .icon.pause'),
      next: document.querySelector('.player-wrapper .icon.next'),
      prev: document.querySelector('.player-wrapper .icon.prev'),
      repeat: document.querySelector('.player-wrapper .player-controls .icon'),
      shuffle: document.querySelector('.player-wrapper .icon.shuffle'),
      like: document.querySelector('.player-wrapper .icon.song'),
      progressbar: document.querySelector('.player-wrapper anghami-buffer .cont'),
      volumebar: document.querySelector('.player-wrapper .volume-bar')
    }

    // Ignore disabled buttons
    for (const key in elms) {
      if (elms[key] && elms[key].disabled) {
        elms[key] = null
      }
    }
    return elms
  }

  WebApp.start()
})(this) // function(Nuvola)
