/**
 * TOEFL Vocabulary Test Application
 * 
 * Features:
 * - Load vocabulary from CSV files
 * - Text-to-speech for word pronunciation
 * - Randomized word order for testing
 * - Support for multiple parts of speech and meanings
 * - Result tracking and export
 * - Timer for tracking test duration
 */

// Application configuration
const APP_CONFIG = {
  repeatCount: 3,      // Number of times to repeat each word
  speechDelay: 1000,   // Delay between word repetitions (ms)
  nextWordDelay: 2000  // Delay before moving to next word (ms)
};

// Main App
const VocaApp = {
  wordList: [],                // Complete list of word entries
  randomOrder: [],             // Random order of words for test
  randomizedWordList: [],      // Word list in random order
  currentPlayingIndex: -1,     // Index of currently spoken word
  isSubmitted: false,          // Whether the test has been submitted
  speechSynth: window.speechSynthesis,  // Speech synthesis API
  testResults: null,           // Test results after submission
  timer: {                     // Timer for test duration
    startTime: null,
    interval: null,
    elapsed: 0
  },
  
  /**
   * Initialize the application
   */
  init() {
    this.loadDayFromUrl();
    this.setupEventListeners();
    document.getElementById('load-modal').style.display = 'block';
  },
  
  /**
   * Extract day number from URL query parameter
   */
  loadDayFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const day = urlParams.get('day');
    
    if (day) {
      document.getElementById('day-number').textContent = day;
    }
  },
  
  /**
   * Set up all event listeners
   */
  setupEventListeners() {
    // File input
    document.getElementById('file-input').addEventListener('change', this.handleFileUpload.bind(this));
    
    // Buttons
    document.getElementById('submit-btn').addEventListener('click', this.submitTest.bind(this));
    document.getElementById('retry-btn').addEventListener('click', this.resetTest.bind(this));
    document.getElementById('export-btn').addEventListener('click', this.exportResults.bind(this));
    
    // Modal controls
    document.querySelectorAll('.close-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const modal = e.target.closest('.modal');
        // Only allow closing load modal if words are loaded
        if (modal.id !== 'load-modal' || this.wordList.length > 0) {
          modal.style.display = 'none';
        }
      });
    });
    
    // Close modal when clicking outside
    window.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal')) {
        // Only allow closing load modal if words are loaded
        if (e.target.id !== 'load-modal' || this.wordList.length > 0) {
          e.target.style.display = 'none';
        }
      }
    });
  },
  
  /**
   * Start the timer
   */
  startTimer() {
    this.timer.startTime = Date.now();
    this.timer.elapsed = 0;
    
    this.timer.interval = setInterval(() => {
      const elapsed = Date.now() - this.timer.startTime;
      this.timer.elapsed = elapsed;
      document.getElementById('timer').textContent = this.formatTime(elapsed);
    }, 1000);
  },
  
  /**
   * Stop the timer
   */
  stopTimer() {
    if (this.timer.interval) {
      clearInterval(this.timer.interval);
      this.timer.interval = null;
    }
  },
  
  /**
   * Format milliseconds to MM:SS
   */
  formatTime(milliseconds) {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  },
  
  /**
   * Handle file upload from input
   */
  handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => this.parseCSV(e.target.result);
    reader.readAsText(file);
  },
  
  /**
   * Parse CSV data and initialize word list
   */
  parseCSV(text) {
    const lines = text.split('\n');
    const words = [];
    let wordId = 1;
    let wordNumber = 1;
    
    // Skip header row if it exists
    const startIdx = lines[0].toLowerCase().includes('word') || 
                     lines[0].toLowerCase().includes('part') ? 1 : 0;
    
    for (let i = startIdx; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const parts = line.split(',');
      if (parts.length < 3) continue;
      
      const word = parts[0].trim();
      const posValues = parts[1].split(';');
      
      // Handle meanings with commas inside
      let meaningsText = parts.slice(2).join(',');
      const meaningSets = meaningsText.split(';');
      
      const validEntries = Math.min(posValues.length, meaningSets.length);
      
      for (let j = 0; j < validEntries; j++) {
        const currentPos = posValues[j].trim();
        const currentMeanings = meaningSets[j].trim();
        const meaningList = currentMeanings.split(/, /);
        
        // Process meanings to handle parentheses
        const processedMeanings = meaningList.map(meaning => {
          const originalMeaning = meaning.trim();
          const noBracketMeaning = originalMeaning.replace(/\([^)]*\)\s*/g, "").trim();
          
          return {
            original: originalMeaning,
            noBracket: noBracketMeaning,
            hasBracket: originalMeaning !== noBracketMeaning
          };
        });
        
        words.push({
          id: wordId++,
          wordIndex: words.length,
          word: word,
          partOfSpeech: currentPos,
          meaning: currentMeanings,
          meaningArray: meaningList,
          processedMeanings: processedMeanings,
          isFirstPOS: j === 0,
          totalPOS: validEntries,
          originalWord: word,
          originalWordId: wordNumber,
          posIndex: j // 품사 인덱스 저장
        });
      }
      
      wordNumber++;
    }
    
    if (words.length > 0) {
      this.wordList = words;
      this.createRandomOrder();
      this.randomizeWordList();
      this.renderWordTable();
      
      document.getElementById('load-modal').style.display = 'none';
      
      // Start the timer when test begins
      this.startTimer();
      
      setTimeout(() => this.speakCurrentWord(0, 0), APP_CONFIG.speechDelay);
    } else {
      alert('유효한 데이터가 없습니다. 파일 형식을 확인해주세요.');
    }
  },
  
  /**
   * Create a randomized order of unique words
   */
  createRandomOrder() {
    // Get indices of unique words (first occurrence of each word)
    const uniqueIndices = [];
    const seenWords = new Set();
    
    this.wordList.forEach((word, index) => {
      if (word.isFirstPOS && !seenWords.has(word.originalWord)) {
        uniqueIndices.push(index);
        seenWords.add(word.originalWord);
      }
    });
    
    // Shuffle the array using Fisher-Yates algorithm
    this.randomOrder = [...uniqueIndices];
    for (let i = this.randomOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.randomOrder[i], this.randomOrder[j]] = [this.randomOrder[j], this.randomOrder[i]];
    }
  },
  
  /**
   * Randomize word list based on the random order
   */
  randomizeWordList() {
    this.randomizedWordList = [];
    const originalWordMap = new Map();
    
    // Group words by original word
    this.wordList.forEach(word => {
      if (!originalWordMap.has(word.originalWord)) {
        originalWordMap.set(word.originalWord, []);
      }
      originalWordMap.get(word.originalWord).push(word);
    });
    
    // Rebuild list according to random order
    this.randomOrder.forEach(index => {
      const word = this.wordList[index];
      const allPosEntries = originalWordMap.get(word.originalWord);
      this.randomizedWordList.push(...allPosEntries);
    });
  },
  
  /**
   * Render the word table with input fields
   */
  renderWordTable() {
    const wordListElement = document.getElementById('word-list');
    wordListElement.innerHTML = '';
    
    let currentWordIndex = -1;
    
    this.randomizedWordList.forEach((word, index) => {
      const row = document.createElement('tr');
      row.setAttribute('data-word-index', word.wordIndex);
      row.setAttribute('data-original-word', word.originalWord);
      row.setAttribute('data-original-id', word.originalWordId);
      row.setAttribute('data-pos-index', word.posIndex);
      
      // Only show the word number for the first part of speech of each word
      const numberCell = document.createElement('td');
      numberCell.className = 'word-number';
      
      if (word.isFirstPOS) {
        currentWordIndex++;
        numberCell.textContent = currentWordIndex + 1;
        if (word.totalPOS > 1) {
          numberCell.rowSpan = word.totalPOS;
        }
      }
      
      const wordCell = document.createElement('td');
      if (word.isFirstPOS) {
        const wordInput = document.createElement('input');
        wordInput.type = 'text';
        wordInput.className = 'input-field word-input';
        wordInput.id = `word-${word.id}`;
        wordInput.setAttribute('data-index', index);
        wordInput.setAttribute('data-pos-index', word.posIndex);
        wordInput.autocomplete = 'off';
        wordInput.placeholder = 'word';
        
        if (word.totalPOS > 1) {
          wordCell.rowSpan = word.totalPOS;
        }
        
        wordCell.appendChild(wordInput);
      }
      
      const posCell = document.createElement('td');
      const posInput = document.createElement('input');
      posInput.type = 'text';
      posInput.className = 'input-field pos-input';
      posInput.id = `pos-${word.id}`;
      posInput.setAttribute('data-index', index);
      posInput.setAttribute('data-pos-index', word.posIndex);
      posInput.autocomplete = 'off';
      posInput.placeholder = 'part of speech';
      posCell.appendChild(posInput);
      
      const meaningCell = document.createElement('td');
      const meaningInput = document.createElement('input');
      meaningInput.type = 'text';
      meaningInput.className = 'input-field meaning-input';
      meaningInput.id = `meaning-${word.id}`;
      meaningInput.setAttribute('data-index', index);
      meaningInput.setAttribute('data-pos-index', word.posIndex);
      meaningInput.autocomplete = 'off';
      meaningInput.placeholder = '뜻';
      meaningCell.appendChild(meaningInput);
      
      // Only add number and word cells for the first part of speech
      if (word.isFirstPOS) {
        row.appendChild(numberCell);
        row.appendChild(wordCell);
      } else {
        // Add empty cells for alignment but hide them
        const emptyCell1 = document.createElement('td');
        emptyCell1.style.display = 'none';
        row.appendChild(emptyCell1);
        
        const emptyCell2 = document.createElement('td');
        emptyCell2.style.display = 'none';
        row.appendChild(emptyCell2);
      }
      
      row.appendChild(posCell);
      row.appendChild(meaningCell);
      
      wordListElement.appendChild(row);
      
      // Add input event listeners
      this.setupInputEvents(word);
    });
    
    // Focus on the first input field
    if (this.randomizedWordList.length > 0 && this.randomizedWordList[0].isFirstPOS) {
      document.getElementById(`word-${this.randomizedWordList[0].id}`).focus();
    }
  },
  
  /**
   * Set up event listeners for input fields
   */
  setupInputEvents(word) {
    // Word input (Enter key moves to part of speech)
    if (word.isFirstPOS) {
      const wordInput = document.getElementById(`word-${word.id}`);
      wordInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          document.getElementById(`pos-${word.id}`).focus();
        }
      });
    }
    
    // Part of speech input (Enter key moves to meaning)
    const posInput = document.getElementById(`pos-${word.id}`);
    posInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        document.getElementById(`meaning-${word.id}`).focus();
      }
    });
    
    // Meaning input (Enter key moves to next word or submits)
    const meaningInput = document.getElementById(`meaning-${word.id}`);
    meaningInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const nextId = word.id + 1;
        if (nextId <= this.wordList.length) {
          const nextWordIndex = this.randomizedWordList.findIndex(w => w.id === nextId);
          if (nextWordIndex !== -1) {
            const nextWord = this.randomizedWordList[nextWordIndex];
            // Focus on word input for first POS, otherwise focus on POS input
            const nextInput = nextWord.isFirstPOS ? 
              document.getElementById(`word-${nextId}`) :
              document.getElementById(`pos-${nextId}`);
            if (nextInput) {
              nextInput.focus();
            }
          }
        } else {
          // Submit if at the end
          this.submitTest();
        }
      }
    });
  },
  
  /**
   * Highlight rows associated with the current word being spoken
   */
  highlightCurrentWord(wordIndex) {
    const currentWord = this.wordList[wordIndex].originalWord;
    
    // Clear previous highlights
    document.querySelectorAll('#word-list tr').forEach(row => {
      row.classList.remove('current');
    });
    
    // Find and highlight all rows with the same original word
    document.querySelectorAll(`#word-list tr[data-original-word="${currentWord}"]`).forEach(row => {
      row.classList.add('current');
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  },
  
  /**
   * Speak the current word in the play order
   */
  speakCurrentWord(index, repeatCount) {
    if (index >= this.randomOrder.length) {
      document.getElementById('progress-status').textContent = '모든 단어가 제공되었습니다. 답안을 작성하고 제출하세요.';
      return;
    }
    
    // Get the word at the current position
    const wordIndex = this.randomOrder[index];
    const word = this.wordList[wordIndex].word;
    
    // Set current playing index and highlight
    this.currentPlayingIndex = wordIndex;
    this.highlightCurrentWord(wordIndex);
    
    // Set up speech utterance
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = 'en-US';
    utterance.rate = 0.8;
    
    // Update progress display
    document.getElementById('progress-status').textContent = 
      `${index + 1}번 단어 ${repeatCount + 1}/${APP_CONFIG.repeatCount}회 재생 중...`;
    
    // Set up what happens when speech ends
    utterance.onend = () => {
      if (this.isSubmitted) return;
      
      if (repeatCount < APP_CONFIG.repeatCount - 1) {
        // Repeat the same word
        setTimeout(() => this.speakCurrentWord(index, repeatCount + 1), APP_CONFIG.speechDelay);
      } else {
        // Move to next word
        setTimeout(() => this.speakCurrentWord(index + 1, 0), APP_CONFIG.nextWordDelay);
      }
    };
    
    // Speak the word
    this.speechSynth.speak(utterance);
  },
  
  /**
   * Collect user answers from all input fields
   */
  collectAnswers() {
    const answers = [];
    
    for (let i = 0; i < this.randomizedWordList.length; i++) {
      const word = this.randomizedWordList[i];
      const id = word.id;
      
      const userPartOfSpeech = document.getElementById(`pos-${id}`).value.trim();
      const userMeaning = document.getElementById(`meaning-${id}`).value.trim();
      
      const answer = {
        word: word.isFirstPOS ? document.getElementById(`word-${id}`).value.trim() : "",
        partOfSpeech: userPartOfSpeech,
        meaning: userMeaning,
        originalWord: word.originalWord,
        isFirstPOS: word.isFirstPOS,
        originalWordId: word.originalWordId,
        posIndex: word.posIndex,
        // 품사는 입력했지만 뜻은 입력하지 않은 경우와 둘 다 입력하지 않은 경우 구분
        posEntered: !!userPartOfSpeech, 
        meaningEntered: !!userMeaning,
        isEmpty: !userPartOfSpeech || !userMeaning
      };
      
      answers.push(answer);
    }
    
    return answers;
  },
  
  /**
   * Check user answers against correct answers
   */
  checkAnswers(answers) {
    const results = [];
    
    // Group answers by original word
    const groupedAnswers = {};
    answers.forEach((answer, index) => {
      const originalWord = answer.originalWord;
      const originalWordId = answer.originalWordId;
      
      if (!groupedAnswers[originalWord]) {
        groupedAnswers[originalWord] = {
          entries: [],
          originalWordId: originalWordId,
          filledEntries: [], // 사용자가 입력한 항목 추적
          emptyCounts: 0,    // 빈칸 개수 추적
          totalPOS: 0        // 총 품사 개수 추적
        };
      }
      
      groupedAnswers[originalWord].totalPOS++;
      
      // 사용자 입력 여부 추적
      if (answer.isEmpty) {
        groupedAnswers[originalWord].emptyCounts++;
      } else {
        groupedAnswers[originalWord].filledEntries.push(answer);
      }
      
      // 모든 항목 저장
      groupedAnswers[originalWord].entries.push({
        answer: answer,
        index: index
      });
    });
    
    // Count correct words
    let correctCount = 0;
    
    // Process each word
    Object.entries(groupedAnswers).forEach(([word, wordGroup]) => {
      const allCorrectAnswersForWord = this.wordList.filter(w => w.originalWord === word);
      let allPartsCorrect = true;
      
      // 해당 단어의 모든 품사별 항목 처리
      wordGroup.entries.forEach(entry => {
        const answer = entry.answer;
        const index = entry.index;
        const posIndex = answer.posIndex;
        
        // 현재 품사에 해당하는 정확한 정답 찾기
        const exactPosAnswer = allCorrectAnswersForWord.find(ca => ca.posIndex === posIndex);
        if (!exactPosAnswer) return; // 해당 품사의 정답이 없으면 스킵
        
        const userPos = answer.partOfSpeech.trim().toLowerCase();
        const userMeaning = answer.meaning.trim().toLowerCase();
        
        // 단어 철자 확인 (첫 번째 품사에만 해당)
        let wordCorrect = true;
        if (answer.isFirstPOS) {
          const correctWord = allCorrectAnswersForWord[0].word.trim().toLowerCase();
          wordCorrect = answer.word.trim().toLowerCase() === correctWord;
          if (!wordCorrect) {
            allPartsCorrect = false;
          }
        }
        
        // 품사 및 의미 정답 여부
        let posCorrect = false;
        let meaningCorrect = false;
        
        // 기본값: 각 품사에 맞는 정확한 정답
        let matchedCorrectAnswer = exactPosAnswer;
        
        // 품사 정확성 확인
        if (userPos) {
          for (const correctAnswer of allCorrectAnswersForWord) {
            const correctPos = correctAnswer.partOfSpeech.trim().toLowerCase();
            
            if (userPos === correctPos) {
              posCorrect = true;
              
              // 품사는 맞았지만 뜻은 빈칸이거나 틀린 경우 
              // -> 해당 품사의 정확한 정답 표시
              if (!userMeaning) {
                matchedCorrectAnswer = correctAnswer; // 정확한 품사의 정답 표시
                allPartsCorrect = false;
                break;
              }
              
              // 품사가 맞고 뜻도 입력한 경우 -> 뜻 확인
              // 뜻 확인 (괄호 포함/제외 모두 체크)
              if (correctAnswer.processedMeanings && correctAnswer.processedMeanings.length > 0) {
                for (const meaning of correctAnswer.processedMeanings) {
                  if (userMeaning === meaning.original.toLowerCase()) {
                    meaningCorrect = true;
                    break;
                  }
                  
                  if (meaning.hasBracket && userMeaning === meaning.noBracket.toLowerCase()) {
                    meaningCorrect = true;
                    break;
                  }
                }
              } else if (correctAnswer.meaningArray && correctAnswer.meaningArray.length > 0) {
                for (const meaning of correctAnswer.meaningArray) {
                  if (userMeaning === meaning.trim().toLowerCase()) {
                    meaningCorrect = true;
                    break;
                  }
                }
              } else {
                const correctMeaning = correctAnswer.meaning.trim().toLowerCase();
                meaningCorrect = userMeaning === correctMeaning;
              }
              
              matchedCorrectAnswer = correctAnswer;
              break;
            }
          }
        }
        
        // 품사를 입력하지 않았거나 잘못 입력한 경우
        if (!posCorrect) {
          // 비어있는 칸에는 해당 품사에 맞는 정답과 다른 품사의 정답 표시
          if (answer.isEmpty) {
            // 여러 품사가 있고 입력한 품사가 있는 경우
            if (wordGroup.filledEntries.length > 0 && allCorrectAnswersForWord.length > 1) {
              // 입력된 품사 목록을 추출
              const enteredPosIndices = wordGroup.filledEntries.map(e => e.posIndex);
              
              // 현재 품사와 다른 품사의 정답을 선택
              if (!enteredPosIndices.includes(posIndex)) {
                // 정확한 품사 정답 사용 (빈칸이면 해당 품사의 정답)
                matchedCorrectAnswer = exactPosAnswer;
              }
            } else {
              // 입력된 품사가 없거나 품사가 하나뿐인 경우
              matchedCorrectAnswer = exactPosAnswer;
            }
          } else {
            // 품사는 입력했으나 틀린 경우
            matchedCorrectAnswer = exactPosAnswer; // 정확한 품사의 정답 사용
          }
          allPartsCorrect = false;
        } else if (!meaningCorrect) {
          // 품사는 맞았지만 뜻이 틀린 경우
          matchedCorrectAnswer = exactPosAnswer; // 정확한 품사의 정답 사용
          allPartsCorrect = false;
        }
        
        // Store results with the matched correct answer
        results.push({
          id: index + 1,
          word: exactPosAnswer.word, // 항상 정확한 단어 사용
          userAnswer: answer,
          correctAnswer: matchedCorrectAnswer, // 품사에 따른 정확한 정답 또는 다른 품사의 정답
          exactPosAnswer: exactPosAnswer, // 정확한 품사의 정답 (항상 저장)
          isCorrect: posCorrect && meaningCorrect,
          wordCorrect: wordCorrect,
          posCorrect: posCorrect,
          meaningCorrect: meaningCorrect,
          isFirstPOS: answer.isFirstPOS,
          originalWordId: exactPosAnswer.originalWordId,
          posIndex: answer.posIndex,
          isEmpty: answer.isEmpty,
          posEntered: answer.posEntered,
          meaningEntered: answer.meaningEntered
        });
      });
      
      if (allPartsCorrect) {
        correctCount++;
      }
    });
    
    const uniqueWordsCount = Object.keys(groupedAnswers).length;
    
    return {
      results: results,
      correctCount: correctCount,
      totalWords: uniqueWordsCount,
      percentage: Math.round((correctCount / uniqueWordsCount) * 100),
      elapsedTime: this.timer.elapsed
    };
  },
  
  /**
   * Submit the test and show results
   */
  submitTest() {
    if (this.isSubmitted) {
      alert('이미 제출되었습니다.');
      return;
    }
    
    if (this.wordList.length === 0) {
      alert('먼저 단어 목록을 불러와주세요.');
      return;
    }
    
    const answers = this.collectAnswers();
    
    // Check for empty fields
    let hasEmptyFields = false;
    answers.forEach(answer => {
      if ((answer.isFirstPOS && !answer.word) || !answer.partOfSpeech || !answer.meaning) {
        hasEmptyFields = true;
      }
    });
    
    if (hasEmptyFields) {
      if (!confirm('일부 답안이 비어있습니다. 그래도 제출하시겠습니까?')) {
        return;
      }
    }
    
    // Stop timer
    this.stopTimer();
    
    // Stop any ongoing speech
    this.speechSynth.cancel();
    this.isSubmitted = true;
    document.getElementById('submit-btn').disabled = true;
    
    const results = this.checkAnswers(answers);
    this.displayResults(results);
    
    // Save results for export
    this.testResults = results;
    
    // Save to local storage
    this.saveResultsToStorage(results);
  },
  
  /**
   * Display test results in the modal
   */
  displayResults(results) {
    // Update summary information
    document.getElementById('score-percentage').textContent = results.percentage;
    document.getElementById('correct-count').textContent = results.correctCount;
    document.getElementById('total-count').textContent = results.totalWords;
    document.getElementById('elapsed-time').textContent = this.formatTime(results.elapsedTime);
    
    // Clear previous results
    const resultsList = document.getElementById('results-list');
    resultsList.innerHTML = '';
    
    // Group results by original word
    const wordGroups = {};
    results.results.forEach(result => {
      const wordKey = result.correctAnswer.originalWord;
      if (!wordGroups[wordKey]) {
        wordGroups[wordKey] = {
          entries: [],
          allCorrect: true,
          originalWordId: result.originalWordId,
          randomOrder: this.randomOrder.findIndex(index => 
            this.wordList[index].originalWord === wordKey
          )
        };
      }
      wordGroups[wordKey].entries.push(result);
      if (!result.isCorrect) {
        wordGroups[wordKey].allCorrect = false;
      }
    });
    
    // Sort by random order (order they were presented in test)
    const sortedWordKeys = Object.keys(wordGroups).sort((a, b) => {
      return wordGroups[a].randomOrder - wordGroups[b].randomOrder;
    });
    
    // Create rows for each word
    let displayIndex = 1;
    
    sortedWordKeys.forEach(wordKey => {
      const wordGroup = wordGroups[wordKey];
      
      // Sort by posIndex to maintain original order
      const entries = [...wordGroup.entries].sort((a, b) => {
        return a.posIndex - b.posIndex;
      });
      
      // Get first entry as base
      const firstResult = entries.find(entry => entry.isFirstPOS) || entries[0];
      
      // Create row
      const row = document.createElement('tr');
      
      // Number cell
      const numberCell = document.createElement('td');
      numberCell.textContent = displayIndex++;
      
      // Word cell with all parts
      const wordCell = document.createElement('td');
      
      // User's word answer
      const userWord = document.createElement('div');
      userWord.textContent = `내 답안: ${firstResult.userAnswer.word || ''}`;
      wordCell.appendChild(userWord);
      
      // Correct word
      const correctWord = document.createElement('div');
      correctWord.textContent = `정답: ${firstResult.correctAnswer.word}`;
      correctWord.className = firstResult.wordCorrect ? 'correct' : 'incorrect';
      wordCell.appendChild(correctWord);
      
      // Word-level correctness indicator
      const wordStatus = document.createElement('div');
      wordStatus.textContent = `단어 전체: ${wordGroup.allCorrect ? '정답' : '오답'}`;
      wordStatus.className = wordGroup.allCorrect ? 'correct' : 'incorrect';
      wordStatus.style.marginTop = '8px';
      wordStatus.style.fontStyle = 'italic';
      wordCell.appendChild(wordStatus);
      
      // Part of speech and meaning cells
      const posCell = document.createElement('td');
      const meaningCell = document.createElement('td');

      // Add each part of speech and meaning
      entries.forEach((result, idx) => {
        // Create containers
        const posContainer = this.createResultSection(idx);
        const meaningContainer = this.createResultSection(idx);
        
        // Part of speech content - "(품사)" 부분 제거
        const userPos = document.createElement('div');
        userPos.textContent = `내 답안: ${result.userAnswer.partOfSpeech || '(입력 없음)'}`;
        
        const correctPos = document.createElement('div');
        correctPos.textContent = `정답: ${result.correctAnswer.partOfSpeech}`;
        correctPos.className = result.posCorrect ? 'correct' : 'incorrect';
        
        posContainer.appendChild(userPos);
        posContainer.appendChild(correctPos);
        posCell.appendChild(posContainer);
        
        // Meaning content - "(품사)" 부분 제거
        const userMeaning = document.createElement('div');
        userMeaning.textContent = `내 답안: ${result.userAnswer.meaning || '(입력 없음)'}`;
        
        // Format all meanings in one line
        const correctMeaning = document.createElement('div');
        
        if (result.correctAnswer.meaningArray && result.correctAnswer.meaningArray.length > 1) {
          const formattedMeanings = result.correctAnswer.meaningArray
            .map(meaning => meaning.trim())
            .join(', ');
          correctMeaning.textContent = `정답: ${formattedMeanings}`;
        } else {
          correctMeaning.textContent = `정답: ${result.correctAnswer.meaning}`;
        }
        
        correctMeaning.className = result.meaningCorrect ? 'correct' : 'incorrect';
        
        meaningContainer.appendChild(userMeaning);
        meaningContainer.appendChild(correctMeaning);
        meaningCell.appendChild(meaningContainer);
      });
      
      // Result cell
      const resultCell = document.createElement('td');
      resultCell.textContent = wordGroup.allCorrect ? '정답' : '오답';
      resultCell.className = wordGroup.allCorrect ? 'correct' : 'incorrect';
      
      // Assemble row
      row.appendChild(numberCell);
      row.appendChild(wordCell);
      row.appendChild(posCell);
      row.appendChild(meaningCell);
      row.appendChild(resultCell);
      
      resultsList.appendChild(row);
    });
    
    // Show the results modal
    document.getElementById('results-modal').style.display = 'block';
  },
  
  /**
   * Create a container for result sections with styling
   */
  createResultSection(index) {
    const container = document.createElement('div');
    container.style.marginBottom = '10px';
    container.style.paddingBottom = '10px';
    
    if (index > 0) {
      container.style.borderTop = '1px dashed #eee';
      container.style.paddingTop = '10px';
    }
    
    return container;
  },
  
  /**
   * Save results to local storage
   */
  saveResultsToStorage(results) {
    try {
      // Get existing results or initialize
      let savedResults = JSON.parse(localStorage.getItem('vocaTestResults')) || [];
      
      // Add current result
      savedResults.push({
        date: new Date().toISOString(),
        score: `${results.percentage}%`,
        correct: results.correctCount,
        total: results.totalWords,
        elapsedTime: this.formatTime(results.elapsedTime),
        day: document.getElementById('day-number').textContent
      });
      
      // Save back to storage
      localStorage.setItem('vocaTestResults', JSON.stringify(savedResults));
      console.log('Results saved successfully to localStorage');
    } catch (error) {
      console.error('Failed to save results:', error);
    }
  },
  
  /**
   * Export results as CSV
   */
  exportResults() {
    if (!this.testResults || !this.testResults.results || this.testResults.results.length === 0) {
      alert('내보낼 결과가 없습니다.');
      return;
    }
    
    // Add UTF-8 BOM for Korean characters
    let csvContent = '\uFEFF';
    csvContent += "번호,단어(정답),단어(내 답안),품사(정답),품사(내 답안),의미(정답),의미(내 답안),결과\n";
    
    // Group by original word
    const wordGroups = {};
    this.testResults.results.forEach(result => {
      const wordKey = result.correctAnswer.originalWord;
      if (!wordGroups[wordKey]) {
        wordGroups[wordKey] = {
          entries: [],
          allCorrect: true,
          originalWordId: result.originalWordId
        };
      }
      wordGroups[wordKey].entries.push(result);
      if (!result.isCorrect) {
        wordGroups[wordKey].allCorrect = false;
      }
    });
    
    // Sort by original ID to maintain original CSV order
    const sortedWordKeys = Object.keys(wordGroups).sort((a, b) => {
      return wordGroups[a].originalWordId - wordGroups[b].originalWordId;
    });
    
    // Generate CSV content
    let displayIndex = 1;
    
    sortedWordKeys.forEach(wordKey => {
      const wordGroup = wordGroups[wordKey];
      
      // Sort by posIndex
      const entries = [...wordGroup.entries].sort((a, b) => {
        return a.posIndex - b.posIndex;
      });
      
      const firstResult = entries.find(entry => entry.isFirstPOS) || entries[0];
      
      entries.forEach((result, idx) => {
        // Format all meanings with commas
        let allMeanings = result.correctAnswer.meaning;
        
        if (result.correctAnswer.meaningArray && result.correctAnswer.meaningArray.length > 1) {
          allMeanings = result.correctAnswer.meaningArray
            .map(meaning => meaning.trim())
            .join(', ');
        }
        
        // User word only in first entry
        const userWord = idx === 0 ? firstResult.userAnswer.word : "";
        
        // Create CSV line
        const entryLine = [
          displayIndex,
          result.correctAnswer.word,
          userWord,
          result.correctAnswer.partOfSpeech,
          result.userAnswer.partOfSpeech || "",
          allMeanings,
          result.userAnswer.meaning || "",
          // Result only in first row of word
          idx === 0 ? (wordGroup.allCorrect ? '정답' : '오답') : ""
        ].join(',');
        
        csvContent += entryLine + '\n';
      });
      
      displayIndex++;
    });
    
    // Create download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    
    // Format filename with date and time
    const now = new Date();
    const dateStr = `${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}`;
    const timeStr = `${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}`;
    const day = document.getElementById('day-number').textContent;
    
    link.setAttribute("href", url);
    link.setAttribute("download", `voca_test_day${day}_results_${dateStr}_${timeStr}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },
  
  /**
   * Reset the test for another attempt
   */
  resetTest() {
    // Hide results modal
    document.getElementById('results-modal').style.display = 'none';
    
    // Reset state
    this.isSubmitted = false;
    document.getElementById('submit-btn').disabled = false;
    
    // Stop any ongoing speech
    this.speechSynth.cancel();
    
    // Clear all input fields
    document.querySelectorAll('.input-field').forEach(input => {
      input.value = '';
    });
    
    // Clear highlighting
    document.querySelectorAll('#word-list tr').forEach(row => {
      row.classList.remove('current');
    });
    
    // Reset and restart timer
    document.getElementById('timer').textContent = '00:00';
    this.startTimer();
    
    // Create new random order
    this.createRandomOrder();
    this.randomizeWordList();
    this.renderWordTable();
    
    // Start speech again
    setTimeout(() => this.speakCurrentWord(0, 0), 500);
  }
};

// Initialize the app when the page loads
document.addEventListener('DOMContentLoaded', () => VocaApp.init());