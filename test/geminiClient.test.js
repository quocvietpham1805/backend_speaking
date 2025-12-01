import axios from 'axios'
import { assessTranscript } from '../src/services/geminiClient.js'

jest.mock('axios')

describe('geminiClient', () => {
  it('parses JSON response from model', async () => {
    const fakeModelText = `Some preface\n{ "bandScore": 6.5, "criteria": { "fluency_coherence": 6.5, "lexical_resource": 6.0, "grammatical_range_accuracy": 6.5, "pronunciation": 6.0 }, "strengths": ["uses a range of vocabulary"], "weaknesses": ["occasional hesitation"], "corrections": [{"original":"I go to travelling","suggestion":"I go travelling","explanation":"preposition"}], "feedback":"Good","followUpQuestions":["Q1","Q2","Q3"], "practicePlan":"Day1;Day2","rawModelOutput":"debug" }`

    axios.post.mockResolvedValue({ data: { output_text: fakeModelText } })

    const result = await assessTranscript(
      'This is a long transcript with more than twenty words to satisfy the test requirement.',
      'testPrompt'
    )

    expect(result.bandScore).toBe(6.5)
    expect(typeof result.criteria).toBe('object')
  })
})
