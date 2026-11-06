import Foundation

enum Config {
    static let supabaseURL = URL(string: "https://avdqtnukgbejorieuunj.supabase.co")!
    // Clave pública (rol anon), la misma que lleva la web en js/nucleo.js. La seguridad está en Auth y RLS.
    static let supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF2ZHF0bnVrZ2Jlam9yaWV1dW5qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzMjcyOTUsImV4cCI6MjEwMDkwMzI5NX0.sq1cepXuBaNT6qygyxKEAhVHJh7G9LZyzaeJBhc7s7s"
    static let webURL = URL(string: "https://appbitacora.es/")!

    static var version: String {
        let i = Bundle.main.infoDictionary
        return "\(i?["CFBundleShortVersionString"] as? String ?? "?") (\(i?["CFBundleVersion"] as? String ?? "?"))"
    }
}
