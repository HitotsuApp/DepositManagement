import { View, Text, StyleSheet } from "@react-pdf/renderer"
import { resolveTemplate } from "../../utils/resolve"

interface FooterBlockProps {
  footer: {
    lines: string[]
    align?: "left" | "center" | "right"
    marginTop?: number
  }
  data: Record<string, any>
}

const FooterBlock = ({ footer, data }: FooterBlockProps) => {
  return (
    <View style={{ marginTop: footer.marginTop ?? 30 }}>
      {footer.lines.map((line, i) => {
        const resolvedLine = resolveTemplate(line, data)
        return (
          <Text
            key={i}
            style={[
              styles.line,
              { textAlign: footer.align ?? "left" },
            ]}
          >
            {resolvedLine}
          </Text>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  line: {
    fontSize: 10,
    marginBottom: 2,
    fontFamily: "NotoSansJP",
  },
})

export default FooterBlock
